/**
 * Document graph pipeline: orchestrates tag extraction, n-gram anchoring,
 * clustering, leaf selection, weighting, labeling, and edge generation into
 * a serialized Graphology graph (README pipeline steps 1-8).
 */

import { SerializedGraph } from 'graphology-types';

import { cluster_tags, select_leaves } from './cluster.js';
import { Config } from './config.js';
import { add_relation_edges, add_similarity_edges, build_graph, ClusterSpec } from './graph.js';
import { anchor_tags, extract_ngrams, Tag, tokenize } from './ngrams.js';
import { TagglyClient } from './taggly.js';


/** Run the full pipeline on a document and return the serialized graph. */
export async function generate_graph(
    text: string, config: Config, client: TagglyClient
): Promise<SerializedGraph> {
  // 1. Extract raw tags for each configured type, in config order
  const tag_limit = config.max_clusters * config.max_leaves;
  const raw_tags = await extract_tags(text, config, client, tag_limit);

  // 2. Anchor tags to document n-grams; count occurrences per tag
  const ngram_counts = extract_ngrams(tokenize(text), config.ngrams);
  const tags = anchor_tags(raw_tags, ngram_counts, config.max_refs);

  // 3-4. Cluster anchored tags, then select representative leaves per cluster
  const groups = cluster_tags(tags, config.max_clusters, client);
  const leaf_groups = groups.map(group => select_leaves(group, config.max_leaves, client));

  // 5. Weight = count / all document n-gram occurrences (or all leaf counts if normalized)
  const leaves = leaf_groups.flat();
  const total = config.normalize
    ? leaves.reduce((sum, leaf) => sum + leaf.count, 0)
    : [...ngram_counts.values()].reduce((sum, count) => sum + count, 0);
  leaves.forEach(leaf => { leaf.weight = leaf.count / Math.max(1, total); });

  // 6. Label each cluster and the root from their children via Taggly keys
  const clusters: ClusterSpec[] = [];
  for (const group of leaf_groups)
    clusters.push({ label: await label_for(group.map(leaf => leaf.key), client), leaves: group });
  const root_label = await label_for(clusters.map(cluster => cluster.label), client);

  // 7-8. Assemble the graph with hierarchy edges plus optional edge types
  const graph = build_graph(root_label, clusters);
  if (config.similarity !== undefined)
    add_similarity_edges(graph, config.similarity, client);
  if (config.extract_relations)
    add_relation_edges(graph, client.ext_relations(new Map(
      leaves.map(leaf => [leaf.key, leaf.refs]))));
  return graph.export();
}


/** Extract tags per configured type: real Taggly calls for implemented commands,
 *  the ext placeholder for any other user-supplied type. */
async function extract_tags(
    text: string, config: Config, client: TagglyClient, tag_limit: number
): Promise<{ key: string; type: string }[]> {
  const max_ngram = Math.max(...config.ngrams);
  const raw_tags: { key: string; type: string }[] = [];

  for (const type of config.tag_types) {
    const keys = type === 'keyword' ? await client.keys(text, tag_limit, max_ngram)
      : type === 'entity' ? await client.ents(text, tag_limit)
      : client.ext_tags(text, tag_limit);
    raw_tags.push(...keys.map(key => ({ key, type })));
  }
  return raw_tags;
}


/** Generate a short label for a set of child keys; falls back to the first key. */
async function label_for(keys: string[], client: TagglyClient): Promise<string> {
  const [label] = await client.keys(keys.join(', '), 1, 2);
  return label ?? keys[0] ?? 'document';
}
