/**
 * N-gram extraction and tag anchoring: maps extracted tags to the document
 * n-grams that contain them, with occurrence counts per tag.
 */


export interface Tag {
  key: string;
  type: string;
  refs: string[];
  count: number;
  weight: number;
}


/**
 * Anchor each tag to the n-grams containing its tokens. Refs are the top
 * max_refs matching n-grams by count; count sums occurrences across all
 * matches. Tags without any match are dropped; duplicate keys keep the
 * first tag's type.
 */
export function anchor_tags(
    tags: { key: string; type: string }[], ngram_counts: Map<string, number>, max_refs: number
): Tag[] {
  const anchored = new Map<string, Tag>();

  for (const { key, type } of tags) {
    const normalized = tokenize(key).join(' ');
    if (!normalized || anchored.has(normalized)) continue;

    // Collect every n-gram containing the tag's tokens as a whole-token phrase
    const matches = [...ngram_counts.entries()]
      .filter(([gram]) => ` ${gram} `.includes(` ${normalized} `))
      .sort(([a, a_count], [b, b_count]) => b_count - a_count || a.localeCompare(b));
    if (!matches.length) continue;

    const count = matches.reduce((sum, [, gram_count]) => sum + gram_count, 0);
    const refs = matches.slice(0, max_refs).map(([gram]) => gram);
    anchored.set(normalized, { key: normalized, type, refs, count, weight: 0 });
  }
  return [...anchored.values()];
}


/** Count every n-gram of the given sizes across the token stream. */
export function extract_ngrams(tokens: string[], sizes: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const size of sizes) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const gram = tokens.slice(i, i + size).join(' ');
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
}


/** Lowercase word tokens (letters, digits, inner hyphens/apostrophes) in order. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}
