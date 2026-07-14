/**
 * Taggly client: HTTP calls for the tags, desc, keys, rank, and score commands
 * against a running Taggly API instance (graphly never installs or spawns Taggly).
 */


export class TagglyClient {
  constructor(readonly url: string) {}

  /** POST body to a Taggly command endpoint with optional query params. */
  private async post(
      command: string, body: Record<string, unknown>, params: Record<string, string> = {}
  ) {
    const query = new URLSearchParams(params).toString();
    const path = query ? `${this.url}/${command}?${query}` : `${this.url}/${command}`;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };

    const response = await fetch(path, options);
    if (response.ok) return response.json();
    if (response.status === 503) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`taggly ${command} failed: ${err?.detail ?? 'unavailable (503)'}`);
    }
    throw new Error(`taggly ${command} failed: HTTP ${response.status}`);
  }

  /**
   * Extract typed tag groups from content, up to top_n per type. concepts is a
   * comma-separated list of categories to extract. Returns the raw
   * Dict[str, List[str]] groups: one key per requested category (plus
   * 'entities', 'keywords', and a combined relevance-sorted 'ranked'/'scored').
   */
  async tags(content: string, top_n: number, concepts: string
  ): Promise<Record<string, string[]>> {
    const data = await this.post('tags', { content }, { top_n: String(top_n), concepts });
    return data.tags as Record<string, string[]>;
  }

  /** Generate a natural-language description of content. */
  async desc(content: string): Promise<string> {
    const data = await this.post('desc', { content });
    return data.description as string;
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

  /** Score each candidate's semantic similarity to query (cosine, one score each). */
  async score(query: string, candidates: string[]): Promise<number[]> {
    const data = await this.post('score', { query, candidates });
    return data.scores as number[];
  }
}


/** Return a client for the running Taggly API at url, or fail with setup guidance. */
export async function connect_taggly(url: string): Promise<TagglyClient> {
  if (!await is_healthy(url))
    throw new Error(`no taggly api responding at ${url} — start one with 'taggly start'`
                    + ` and point graphly at it via --taggly-url http://<host>:<port>`);
  return new TagglyClient(url);
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
