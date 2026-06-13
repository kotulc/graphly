/**
 * Graph assembly: builds the Graphology document graph (root, cluster, and
 * leaf nodes with hierarchy edges, plus optional similarity/relation edges).
 * Cluster and root node ids are prefixed with '#' so they can never collide
 * with tag keys, which contain word tokens only.
 */

import { MultiGraph } from 'graphology';

import { Tag } from './ngrams.js';
import { Relation, TagglyClient } from './taggly.js';


export interface ClusterSpec { label: string; leaves: Tag[] }


/** Add undirected typed relation edges between leaf nodes that exist in the graph. */
export function add_relation_edges(graph: MultiGraph, relations: Relation[]): void {
  for (const { source, target, type } of relations) {
    if (graph.hasNode(source) && graph.hasNode(target))
      graph.addUndirectedEdge(source, target, { type });
  }
}


/** Add undirected 'related' edges between leaf pairs meeting the similarity threshold. */
export function add_similarity_edges(graph: MultiGraph, threshold: number, client: TagglyClient) {
  const leaves = graph.filterNodes(node => !node.startsWith('#'));
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const score = client.score(leaves[i], leaves[j]);
      if (score >= threshold)
        graph.addUndirectedEdge(leaves[i], leaves[j], { type: 'related', weight: round(score) });
    }
  }
}


/**
 * Build the document graph: one root, one node per cluster, one node per leaf,
 * with hierarchy ('contains') edges always written. Cluster and root count and
 * weight aggregate their children; only leaves carry refs.
 */
export function build_graph(root_label: string, clusters: ClusterSpec[]): MultiGraph {
  const graph = new MultiGraph();
  let root_count = 0;
  let root_weight = 0;

  clusters.forEach((cluster, i) => {
    const count = cluster.leaves.reduce((sum, leaf) => sum + leaf.count, 0);
    const weight = round(cluster.leaves.reduce((sum, leaf) => sum + leaf.weight, 0));
    graph.addNode(`#cluster_${i}`, { key: cluster.label, type: 'cluster', count, weight });

    for (const leaf of cluster.leaves) {
      graph.addNode(leaf.key, { ...leaf, weight: round(leaf.weight) });
      graph.addDirectedEdge(`#cluster_${i}`, leaf.key, { type: 'contains' });
    }
    root_count += count;
    root_weight += weight;
  });

  graph.addNode('#root',
                { key: root_label, type: 'root', count: root_count, weight: round(root_weight) });
  clusters.forEach((_, i) => graph.addDirectedEdge('#root', `#cluster_${i}`, { type: 'contains' }));
  return graph;
}


/** Round to 4 decimal places for stable, readable serialized output. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
