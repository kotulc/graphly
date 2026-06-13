/**
 * Tag clustering and leaf selection: k-means over similarity-row vectors
 * (via the score command) and MMR-based per-cluster selection (via rel).
 */

import { kmeans } from 'ml-kmeans';

import { Tag } from './ngrams.js';
import { TagglyClient } from './taggly.js';


const KMEANS_SEED = 42;  // Fixed seed keeps clustering deterministic across runs


/**
 * Group tags into at most max_clusters clusters of similar tags. Each tag's
 * feature vector is its similarity to every other tag, so clustering improves
 * transparently once Taggly's semantic score command replaces the placeholder.
 */
export function cluster_tags(tags: Tag[], max_clusters: number, client: TagglyClient): Tag[][] {
  const k = Math.min(max_clusters, tags.length);
  if (k < 2) return tags.length ? [tags] : [];

  const vectors = tags.map(a => tags.map(b => client.score(a.key, b.key)));
  const result = kmeans(vectors, k, { seed: KMEANS_SEED });

  const groups: Tag[][] = Array.from({ length: k }, () => []);
  result.clusters.forEach((cluster, i) => groups[cluster].push(tags[i]));
  return groups.filter(group => group.length > 0);
}


/** Select up to max_leaves representative tags from a cluster using MMR. */
export function select_leaves(group: Tag[], max_leaves: number, client: TagglyClient): Tag[] {
  const sorted = [...group].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const relevance = new Map(sorted.map(tag => [tag.key, tag.count]));
  const chosen = new Set(client.rel(sorted.map(tag => tag.key), relevance, max_leaves));
  return sorted.filter(tag => chosen.has(tag.key));
}
