/**
 * Unit tests for graph assembly: nodes, hierarchy edges, and optional edge types.
 */

import { describe, expect, it } from 'vitest';

import { add_relation_edges, add_similarity_edges, build_graph } from '../src/graph.js';
import { TagglyClient } from '../src/taggly.js';
import { Tag } from '../src/ngrams.js';


const client = new TagglyClient('http://127.0.0.1:8000');

const leaf = (key: string, count: number, weight: number): Tag =>
  ({ key, type: 'keyword', refs: [key], count, weight });

const clusters = [
  { label: 'letters', leaves: [leaf('alpha beta', 4, 0.2), leaf('gamma', 2, 0.1)] },
  { label: 'space', leaves: [leaf('rocket', 2, 0.1)] },
];


describe('build_graph', () => {
  const graph = build_graph('document', clusters);

  it('creates one root, one node per cluster, and one node per leaf', () => {
    expect(graph.order).toBe(1 + 2 + 3);
    expect(graph.getNodeAttributes('#root')).toMatchObject({ key: 'document', type: 'root' });
  });

  it('aggregates cluster and root count and weight from children', () => {
    expect(graph.getNodeAttributes('#cluster_0')).toMatchObject({ count: 6, weight: 0.3 });
    expect(graph.getNodeAttributes('#root')).toMatchObject({ count: 8, weight: 0.4 });
  });

  it('always writes root->cluster and cluster->leaf hierarchy edges', () => {
    expect(graph.hasDirectedEdge('#root', '#cluster_0')).toBe(true);
    expect(graph.hasDirectedEdge('#cluster_1', 'rocket')).toBe(true);
    expect(graph.size).toBe(2 + 3);
  });

  it('preserves leaf attributes', () => {
    expect(graph.getNodeAttributes('alpha beta'))
      .toEqual({ key: 'alpha beta', type: 'keyword', refs: ['alpha beta'], count: 4, weight: 0.2 });
  });
});


describe('add_similarity_edges', () => {
  it('adds related edges only at or above the threshold', () => {
    const graph = build_graph('document', clusters);
    add_similarity_edges(graph, 0.3, client);
    // 'alpha beta' vs 'gamma'/'rocket' share no tokens; no pair meets 0.3
    expect(graph.size).toBe(5);

    add_similarity_edges(graph, 0, client);
    // Zero threshold connects every leaf pair
    expect(graph.size).toBe(5 + 3);
  });
});


describe('add_relation_edges', () => {
  it('adds typed edges between existing leaf nodes only', () => {
    const graph = build_graph('document', clusters);
    add_relation_edges(graph, [
      { source: 'gamma', target: 'rocket', type: 'co_occurs' },
      { source: 'gamma', target: 'missing', type: 'co_occurs' },
    ]);
    expect(graph.size).toBe(6);
    expect(graph.hasUndirectedEdge('gamma', 'rocket')).toBe(true);
  });
});
