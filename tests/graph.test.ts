/**
 * Unit tests for graph assembly: nodes, hierarchy edges, and export ordering.
 */

import { describe, expect, it } from 'vitest';

import { build_graph } from '../src/graph.js';


const concepts = ['machine learning', 'Acme Corp'];

const leaves_by_concept = new Map([
  ['machine learning', ['neural network', 'training data']],
  ['Acme Corp', ['training data', 'launch site']],
]);

const forms_by_leaf = new Map([
  ['neural network', ['neural network', 'Neural Network']],
  ['training data', ['training data']],
  ['launch site', ['launch site', 'Launch Site']],
]);

const doc_key = 'test.md';
const description = 'A document about AI and rockets.';
const topics = ['machine learning', 'aerospace'];


describe('build_graph', () => {
  const graph = build_graph(
    doc_key, description, topics, concepts, leaves_by_concept, forms_by_leaf);

  it('creates one root node, one per concept, and one per unique leaf', () => {
    // unique leaves: neural network, training data, launch site = 3
    expect(graph.order).toBe(1 + 2 + 3);
  });

  it('sets root node attributes correctly', () => {
    const attrs = graph.getNodeAttributes('#topic');
    expect(attrs.key).toBe(doc_key);
    expect(attrs.category).toBe('topic');
    expect(attrs.label).toBe('machine learning');
    expect(attrs.description).toBe(description);
    expect(attrs.topics).toEqual(topics);
    expect(attrs.children).toEqual(['machine learning', 'Acme Corp']);
  });

  it('sets concept node attributes including children list', () => {
    const attrs = graph.getNodeAttributes('machine learning');
    expect(attrs.category).toBe('concept');
    expect(attrs.children).toEqual(['neural network', 'training data']);
  });

  it('sets leaf node attributes with forms and empty children', () => {
    const attrs = graph.getNodeAttributes('neural network');
    expect(attrs.category).toBe('keyword');
    expect(attrs.forms).toEqual(['neural network', 'Neural Network']);
    expect(attrs.children).toEqual([]);
  });

  it('deduplicates shared leaf nodes across concepts', () => {
    // 'training data' appears in both concepts' children but only as one graph node
    expect(graph.filterNodes(n => n === 'training data').length).toBe(1);
  });

  it('writes root->concept and concept->leaf hierarchy edges', () => {
    expect(graph.hasDirectedEdge('#topic', 'machine learning')).toBe(true);
    expect(graph.hasDirectedEdge('#topic', 'Acme Corp')).toBe(true);
    expect(graph.hasDirectedEdge('machine learning', 'neural network')).toBe(true);
    expect(graph.hasDirectedEdge('Acme Corp', 'launch site')).toBe(true);
  });

  it('exports nodes in order: root first, then concepts, then leaves', () => {
    const exported = graph.export();
    const ids = exported.nodes!.map((n: any) => n.key);
    const concept_ids = new Set(concepts);
    expect(ids[0]).toBe('#topic');
    // All concept IDs appear before any leaf ID
    let saw_leaf = false;
    for (const id of ids.slice(1)) {
      if (!concept_ids.has(id)) saw_leaf = true;
      expect(saw_leaf && concept_ids.has(id)).toBe(false);
    }
  });
});
