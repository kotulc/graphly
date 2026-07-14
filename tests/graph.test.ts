/**
 * Unit tests for graph assembly: nodes, coverage weights, hierarchy edges,
 * and export ordering.
 */

import { describe, expect, it } from 'vitest';

import { build_graph } from '../src/graph.js';


const concepts = [
  { key: 'machine learning', category: 'concepts', similarity: 0.8 },
  { key: 'Acme Corp', category: 'entities', similarity: 0.5 },
];

const leaves_by_concept = new Map([
  ['machine learning', ['neural network', 'training data']],
  ['Acme Corp', ['training data', 'launch site']],
]);

const leaf_info = new Map([
  ['neural network', { forms: ['neural network', 'Neural Network'], count: 2, weight: 0.1 }],
  ['training data', { forms: ['training data'], count: 3, weight: 0.15 }],
  ['launch site', { forms: ['launch site', 'Launch Site'], count: 2, weight: 0.1 }],
]);

const doc_key = 'test.md';
const description = 'A document about AI and rockets.';
const topics = ['machine learning', 'aerospace'];


describe('build_graph', () => {
  const graph = build_graph(
    doc_key, description, topics, concepts, leaves_by_concept, leaf_info);

  it('creates one root node, one per concept, and one per unique leaf', () => {
    // unique leaves: neural network, training data, launch site = 3
    expect(graph.order).toBe(1 + 2 + 3);
  });

  it('sets root node attributes with coverage weight over unique leaves', () => {
    const attrs = graph.getNodeAttributes('#topic');
    expect(attrs.key).toBe(doc_key);
    expect(attrs.category).toBe('topic');
    expect(attrs.label).toBe('machine learning');
    expect(attrs.description).toBe(description);
    expect(attrs.topics).toEqual(topics);
    expect(attrs.children).toEqual(['machine learning', 'Acme Corp']);
    expect(attrs.weight).toBeCloseTo(0.35);  // 0.1 + 0.15 + 0.1, each leaf once
  });

  it('sets concept node weight to the sum of its children weights', () => {
    expect(graph.getNodeAttributes('machine learning').weight).toBeCloseTo(0.25);
    expect(graph.getNodeAttributes('Acme Corp').weight).toBeCloseTo(0.25);
    expect(graph.getNodeAttributes('machine learning').category).toBe('concepts');
  });

  it('root weight is the greatest weight in the graph', () => {
    const root_weight = graph.getNodeAttributes('#topic').weight;
    graph.forEachNode((node, attrs) => {
      if (node !== '#topic') expect(attrs.weight).toBeLessThanOrEqual(root_weight);
    });
  });

  it('sets leaf node attributes with forms, count, weight, and empty children', () => {
    const attrs = graph.getNodeAttributes('neural network');
    expect(attrs.category).toBe('keyword');
    expect(attrs.forms).toEqual(['neural network', 'Neural Network']);
    expect(attrs.count).toBe(2);
    expect(attrs.weight).toBeCloseTo(0.1);
    expect(attrs.children).toEqual([]);
  });

  it('deduplicates shared leaf nodes across concepts', () => {
    // 'training data' appears in both concepts' children but only as one graph node
    expect(graph.filterNodes(n => n === 'training data').length).toBe(1);
  });

  it('writes only root->concept edges, weighted by concept similarity', () => {
    expect(graph.size).toBe(concepts.length);
    expect(graph.hasDirectedEdge('#topic', 'machine learning')).toBe(true);
    expect(graph.hasDirectedEdge('#topic', 'Acme Corp')).toBe(true);
    expect(graph.hasDirectedEdge('machine learning', 'neural network')).toBe(false);
    const edge = graph.edges('#topic', 'machine learning')[0];
    expect(graph.getEdgeAttribute(edge, 'weight')).toBe(0.8);
    expect(graph.getEdgeAttribute(edge, 'category')).toBe('contains');
  });

  it('exports nodes in order: root first, then concepts, then leaves', () => {
    const exported = graph.export();
    const ids = exported.nodes!.map((n: any) => n.key);
    const concept_ids = new Set(concepts.map(c => c.key));
    expect(ids[0]).toBe('#topic');
    // All concept IDs appear before any leaf ID
    let saw_leaf = false;
    for (const id of ids.slice(1)) {
      if (!concept_ids.has(id)) saw_leaf = true;
      expect(saw_leaf && concept_ids.has(id)).toBe(false);
    }
  });
});
