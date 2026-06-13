/**
 * Taggly client: real HTTP calls for implemented commands (keys, ents),
 * deterministic local placeholders for planned commands (score, rel, ext),
 * and Taggly API server lifecycle management.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

import { tokenize } from './ngrams.js';


export interface Relation { source: string; target: string; type: string }

export interface TagglySession { client: TagglyClient; stop: () => void }


// Minimal stop-word set used only by the ext placeholder's frequency heuristic
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'had', 'has',
  'have', 'he', 'her', 'his', 'if', 'in', 'is', 'it', 'its', 'not', 'of', 'on', 'or',
  'she', 'that', 'the', 'their', 'they', 'this', 'to', 'was', 'we', 'were', 'while',
  'will', 'with', 'you',
]);

const SPAWN_TIMEOUT_MS = 300_000;  // First spawn may download/load heavy models


export class TagglyClient {
  constructor(readonly url: string) {}

  /** POST content to a Taggly command endpoint with config values as query params. */
  private async post(command: string, content: string, params: Record<string, string>) {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${this.url}/${command}?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error(`taggly ${command} failed: HTTP ${response.status}`);
    return response.json();
  }

  /** Extract up to top_n keywords (phrases up to ngram_max tokens) from content. */
  async keys(content: string, top_n: number, ngram_max = 3): Promise<string[]> {
    const data = await this.post('keys', content,
                                 { top_n: String(top_n), ngram_max: String(ngram_max) });
    return data.keywords;
  }

  /** Extract up to top_n named entities from content. */
  async ents(content: string, top_n: number): Promise<string[]> {
    const data = await this.post('ents', content, { top_n: String(top_n) });
    return data.entities;
  }

  // --- Placeholders for planned Taggly commands (score, rel, ext). Each mirrors the
  // --- planned command's contract and is swapped for an HTTP call once available.

  /** score placeholder: Jaccard token overlap standing in for semantic similarity. */
  score(a: string, b: string): number {
    const a_tokens = new Set(tokenize(a));
    const b_tokens = new Set(tokenize(b));
    const shared = [...a_tokens].filter(token => b_tokens.has(token)).length;
    const union = new Set([...a_tokens, ...b_tokens]).size;
    return union ? shared / union : 0;
  }

  /** rel placeholder: MMR-shaped selection balancing relevance and diversity. */
  rel(candidates: string[], relevance: Map<string, number>, top_n: number): string[] {
    const max_relevance = Math.max(1, ...relevance.values());
    const selected: string[] = [];
    const remaining = [...candidates];

    while (selected.length < top_n && remaining.length) {
      let best = remaining[0];
      let best_score = -Infinity;
      for (const candidate of remaining) {
        const relevance_score = (relevance.get(candidate) ?? 0) / max_relevance;
        const redundancy = Math.max(0, ...selected.map(pick => this.score(candidate, pick)));
        const mmr = 0.5 * relevance_score - 0.5 * redundancy;
        if (mmr > best_score) [best, best_score] = [candidate, mmr];
      }
      selected.push(best);
      remaining.splice(remaining.indexOf(best), 1);
    }
    return selected;
  }

  /** ext placeholder (tags): most frequent non-stop-word tokens, count then alpha order. */
  ext_tags(content: string, top_n: number): string[] {
    const counts = new Map<string, number>();
    for (const token of tokenize(content)) {
      if (token.length > 2 && !STOP_WORDS.has(token))
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a, a_count], [b, b_count]) => b_count - a_count || a.localeCompare(b))
      .slice(0, top_n)
      .map(([token]) => token);
  }

  /** ext placeholder (relations): typed edges between tags sharing an identical ref. */
  ext_relations(refs_by_tag: Map<string, string[]>): Relation[] {
    const tags = [...refs_by_tag.keys()];
    const relations: Relation[] = [];
    for (let i = 0; i < tags.length; i++) {
      const refs = new Set(refs_by_tag.get(tags[i]));
      for (let j = i + 1; j < tags.length; j++) {
        if (refs_by_tag.get(tags[j])!.some(ref => refs.has(ref)))
          relations.push({ source: tags[i], target: tags[j], type: 'co_occurs' });
      }
    }
    return relations;
  }
}


/**
 * Connect to a running Taggly API at url, or spawn a local `taggly` server
 * (MODE=api with keys/ents warmup) when the url is local and unreachable.
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
    env: { ...process.env, MODE: 'api', PORT: port || '8000', WARMUP: '["keys", "ents"]' },
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
