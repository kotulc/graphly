/**
 * Taggly client: HTTP calls for the tags, desc, topics, keys, and rank commands,
 * with API server lifecycle management.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';


export interface Tag { key: string; type: string }

export interface TagglySession { client: TagglyClient; stop: () => void }


const SPAWN_TIMEOUT_MS = 300_000;  // First spawn may download/load heavy models

const TAG_TYPES: Record<string, string> = {
  entities: 'entity', keywords: 'keyword', topics: 'topic',
  concepts: 'concept', relations: 'relation',
};


export class TagglyClient {
  constructor(readonly url: string) {}

  /** POST body to a Taggly command endpoint with optional query params. */
  private async post(
      command: string, body: Record<string, unknown>, params: Record<string, string> = {}
  ) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `${this.url}/${command}?${query}` : `${this.url}/${command}`;
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`taggly ${command} failed: HTTP ${response.status}`);
    return response.json();
  }

  /**
   * Extract up to top_n typed tags from content.
   * Parses the current Dict[str, List[str]] format: each dict key is a tag type
   * (entities, keywords, …), values are the tag strings of that type. The combined
   * 'ranked' or 'scored' key provides the priority order. Plural dict keys are
   * normalized to singular type names (entities→entity, keywords→keyword, etc.).
   * Falls back to assigning type 'keyword' for legacy plain string array responses.
   */
  async tags(content: string, top_n: number): Promise<Tag[]> {
    const data = await this.post('tags', { content }, { top_n: String(top_n) });
    const raw = data.tags;

    if (Array.isArray(raw))
      return (raw as string[]).map(key => ({ key, type: 'keyword' }));

    const groups = raw as Record<string, string[]>;
    const reserved = new Set(['ranked', 'scored']);
    const type_by_key = new Map<string, string>();
    for (const [plural_type, keys] of Object.entries(groups)) {
      if (reserved.has(plural_type)) continue;
      const type = TAG_TYPES[plural_type] ?? plural_type;
      for (const key of keys) if (!type_by_key.has(key)) type_by_key.set(key, type);
    }

    const ordered: string[] = groups['ranked'] ?? groups['scored'] ?? [...type_by_key.keys()];
    return ordered
      .filter(key => type_by_key.has(key))
      .slice(0, top_n)
      .map(key => ({ key, type: type_by_key.get(key)! }));
  }

  /** Generate a natural-language description of content. */
  async desc(content: string): Promise<string> {
    const data = await this.post('desc', { content });
    return data.description as string;
  }

  /** Discover up to top_n topics across the supplied documents. */
  async topics(documents: string[], top_n: number): Promise<string[]> {
    const data = await this.post('topics', { documents }, { top_n: String(top_n) });
    return data.topics as string[];
  }

  /** Extract up to top_n keyword phrases from content. */
  async keys(content: string, top_n: number): Promise<string[]> {
    const data = await this.post('keys', { content }, { top_n: String(top_n) });
    return data.keywords as string[];
  }

  /** Rank candidates by Maximal Marginal Relevance against query, returning top_n. */
  async rank(query: string, candidates: string[], top_n: number): Promise<string[]> {
    const data = await this.post('rank', { query, candidates }, { top_n: String(top_n) });
    return data.ranked as string[];
  }
}


/**
 * Connect to a running Taggly API at url, or spawn a local `taggly` server
 * (MODE=api with tags/keys warmup) when the url is local and unreachable.
 * stop() kills the server only if this session spawned it.
 */
export async function connect_taggly(url: string): Promise<TagglySession> {
  const client = new TagglyClient(url);
  if (await is_healthy(url)) return { client, stop: () => {} };

  const { hostname, port } = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(hostname))
    throw new Error(`no taggly api responding at ${url} (cannot spawn a remote server)`);

  console.error(`spawning taggly api at ${url} (first run may take a while)...`);
  const child = spawn('taggly', [], {
    env: { ...process.env, MODE: 'api', PORT: port || '8000', WARMUP: '["tags", "keys"]' },
    stdio: 'ignore',
  });
  await wait_healthy(url, child);
  return { client, stop: () => void child.kill() };
}


/** True when a Taggly (FastAPI) server answers at url. */
async function is_healthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/openapi.json`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}


/** Poll until the spawned server answers, fails to start, or times out. */
async function wait_healthy(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + SPAWN_TIMEOUT_MS;
  let exited = false;
  child.once('exit', () => { exited = true; });
  child.once('error', () => { exited = true; });

  while (Date.now() < deadline) {
    if (exited) throw new Error('taggly failed to start (is it installed and on PATH?)');
    if (await is_healthy(url)) return;
    await sleep(1000);
  }
  child.kill();
  throw new Error(`taggly api did not become ready at ${url} within ${SPAWN_TIMEOUT_MS / 1000}s`);
}
