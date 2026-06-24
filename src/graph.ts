/**
 * Graph assembly: builds the Graphology document graph (doc, tag, leaf nodes
 * with hierarchy edges). Nodes are inserted in export order: doc → tags → leaves.
 */

import { MultiGraph } from 'graphology';

import { Tag } from './taggly.js';


/**
 * Build the document graph and return the assembled Graphology instance.
 * Doc node ID is '#doc'; tag and leaf node IDs are their key strings.
 * Each node's 'children' attribute lists the Graphology IDs of its children.
 */
export function build_graph(
  doc_key: string,
  description: string,
  topics: string[],
  tags: Tag[],
  leaves_by_tag: Map<string, string[]>,
  forms_by_leaf: Map<string, string[]>,
): MultiGraph {
  const graph = new MultiGraph();

  graph.addNode('#doc', {
    key: doc_key,
    type: 'doc',
    label: topics[0] ?? doc_key,
    description,
    topics,
    children: tags.map(t => t.key),
  });

  for (const tag of tags) {
    const children = leaves_by_tag.get(tag.key) ?? [];
    if (!graph.hasNode(tag.key))
      graph.addNode(tag.key, { key: tag.key, type: tag.type, children });
    graph.addDirectedEdge('#doc', tag.key, { type: 'contains' });
  }

  const seen = new Set<string>();
  for (const tag of tags) {
    for (const leaf of (leaves_by_tag.get(tag.key) ?? [])) {
      if (!seen.has(leaf)) {
        if (!graph.hasNode(leaf))
          graph.addNode(leaf, {
            key: leaf,
            type: 'keyword',
            forms: forms_by_leaf.get(leaf) ?? [],
            children: [],
          });
        seen.add(leaf);
      }
      if (leaf !== tag.key)
        graph.addDirectedEdge(tag.key, leaf, { type: 'contains' });
    }
  }

  return graph;
}
