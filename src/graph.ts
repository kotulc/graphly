/**
 * Graph assembly: builds the Graphology document graph (topic root, concept,
 * and keyword leaf nodes with hierarchy edges). Nodes are inserted in export
 * order: root → concepts → leaves. Node kinds are stored under 'category'
 * ('type' is reserved by Sigma for its render programs).
 */

import { MultiGraph } from 'graphology';


/**
 * Build the document graph and return the assembled Graphology instance.
 * Root node ID is '#topic' (the '#' prefix cannot collide with tag strings);
 * concept and leaf node IDs are their key strings. Each node's 'children'
 * attribute lists the Graphology IDs of its children.
 */
export function build_graph(
  doc_key: string,
  description: string,
  topics: string[],
  concepts: string[],
  leaves_by_concept: Map<string, string[]>,
  forms_by_leaf: Map<string, string[]>,
): MultiGraph {
  const graph = new MultiGraph();

  graph.addNode('#topic', {
    key: doc_key,
    category: 'topic',
    label: topics[0] ?? doc_key,
    description,
    topics,
    children: concepts,
  });

  for (const concept of concepts) {
    const children = leaves_by_concept.get(concept) ?? [];
    if (!graph.hasNode(concept))
      graph.addNode(concept, { key: concept, category: 'concept', children });
    graph.addDirectedEdge('#topic', concept, { category: 'contains' });
  }

  const seen = new Set<string>();
  for (const concept of concepts) {
    for (const leaf of (leaves_by_concept.get(concept) ?? [])) {
      if (!seen.has(leaf)) {
        if (!graph.hasNode(leaf))
          graph.addNode(leaf, {
            key: leaf,
            category: 'keyword',
            forms: forms_by_leaf.get(leaf) ?? [],
            children: [],
          });
        seen.add(leaf);
      }
      if (leaf !== concept)
        graph.addDirectedEdge(concept, leaf, { category: 'contains' });
    }
  }

  return graph;
}
