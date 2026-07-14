/**
 * Graph assembly: builds the Graphology document graph (topic root, categorized
 * concept nodes, keyword leaves) with root→concept hierarchy edges only. Nodes
 * are inserted in export order: root → concepts → leaves. Node kinds are stored
 * under 'category' ('type' is reserved by Sigma for its render programs).
 * Node 'weight' is document coverage: the fraction of document words covered by
 * the node's keyword occurrences (leaves), its children (concepts), or all
 * leaves (root — always the greatest weight in the graph).
 */

import { MultiGraph } from 'graphology';


/** A concept node: its tag string, the tag category it was extracted as, and its
 *  similarity to the root query (stored as the root→concept edge weight). */
export interface Concept { key: string; category: string; similarity: number }

/** Leaf document statistics: surface forms, occurrence count, and coverage weight. */
export interface LeafInfo { forms: string[]; count: number; weight: number }


/**
 * Build the document graph and return the assembled Graphology instance.
 * Root node ID is '#topic' (the '#' prefix cannot collide with tag strings);
 * concept and leaf node IDs are their key strings. Each node's 'children'
 * attribute lists the Graphology IDs of its children. Only root→concept edges
 * are written; each carries the concept's similarity to the root query as
 * 'weight'. Concept→leaf membership is expressed by the 'children' lists.
 */
export function build_graph(
  doc_key: string,
  description: string,
  topics: string[],
  concepts: Concept[],
  leaves_by_concept: Map<string, string[]>,
  leaf_info: Map<string, LeafInfo>,
): MultiGraph {
  const graph = new MultiGraph();
  const leaf_weight = (leaf: string) => leaf_info.get(leaf)?.weight ?? 0;

  // Root weight: document coverage of all unique assigned leaves
  const unique_leaves = new Set([...leaves_by_concept.values()].flat());
  const root_weight = [...unique_leaves].reduce((sum, leaf) => sum + leaf_weight(leaf), 0);

  graph.addNode('#topic', {
    key: doc_key,
    category: 'topic',
    label: topics[0] ?? doc_key,
    description,
    topics,
    children: concepts.map(c => c.key),
    weight: root_weight,
  });

  for (const concept of concepts) {
    const children = leaves_by_concept.get(concept.key) ?? [];
    if (!graph.hasNode(concept.key))
      graph.addNode(concept.key, {
        key: concept.key,
        category: concept.category,
        children,
        weight: children.reduce((sum, leaf) => sum + leaf_weight(leaf), 0),
      });
    graph.addDirectedEdge('#topic', concept.key,
      { category: 'contains', weight: concept.similarity });
  }

  for (const leaf of unique_leaves) {
    if (graph.hasNode(leaf)) continue;
    const info = leaf_info.get(leaf);
    graph.addNode(leaf, {
      key: leaf,
      category: 'keyword',
      forms: info?.forms ?? [],
      count: info?.count ?? 0,
      weight: info?.weight ?? 0,
      children: [],
    });
  }

  return graph;
}
