/**
 * Unit tests for the tree data contract: schema validation, file loading,
 * and build_tree assembly with aggregated values.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { build_tree, load_tree, tree_schema, TreeNode } from '../src/tree.js';


const concepts = [
  { key: 'machine learning', category: 'concepts', similarity: 0.8 },
  { key: 'Acme Corp', category: 'entities', similarity: 0.5 },
];

const leaves_by_concept = new Map([
  ['machine learning', ['neural network', 'training data']],
  ['Acme Corp', ['training data', 'launch site']],
]);

const leaf_info = new Map([
  ['neural network',
    { forms: ['neural network', 'Neural Network'], count: 2, coverage: 0.1, relevance: 0.4 }],
  ['training data', { forms: ['training data'], count: 3, coverage: 0.15, relevance: 0.3 }],
  ['launch site', { forms: ['launch site'], count: 2, coverage: 0.1, relevance: 0.2 }],
]);

const description = 'A document about AI and rockets.';
const topics = ['machine learning', 'aerospace'];


describe('build_tree', () => {
  const tree = build_tree(
    'test.md', description, topics, concepts, leaves_by_concept, leaf_info);
  const [ml, acme] = tree.root.children!;

  it('produces a valid tree file titled by the top topic', () => {
    expect(() => tree_schema.parse(tree)).not.toThrow();
    expect(tree.version).toBe(1);
    expect(tree.title).toBe('machine learning');
    expect(tree.values).toEqual(['relevance', 'coverage', 'count']);
  });

  it('falls back to the document key when no topics were extracted', () => {
    const bare = build_tree('test.md', description, [], [], new Map(), new Map());
    expect(bare.root.name).toBe('test.md');
    expect(bare.root.children).toEqual([]);
  });

  it('aggregates root values over unique leaves with full relevance', () => {
    expect(tree.root.values.coverage).toBeCloseTo(0.35);  // each shared leaf once
    expect(tree.root.values.count).toBe(7);
    expect(tree.root.values.relevance).toBe(1);
    expect(tree.root.meta).toEqual({ description, topics: 'machine learning, aerospace' });
  });

  it('sums concept count and coverage from children, relevance from similarity', () => {
    expect(ml.values).toEqual({ relevance: 0.8, coverage: 0.25, count: 5 });
    expect(acme.values).toEqual({ relevance: 0.5, coverage: 0.25, count: 5 });
    expect(ml.meta).toEqual({ category: 'concepts' });
  });

  it('root coverage is the greatest coverage in the tree', () => {
    const walk = (node: TreeNode): number[] =>
      [node.values.coverage, ...(node.children ?? []).flatMap(walk)];
    expect(Math.max(...walk(tree.root))).toBe(tree.root.values.coverage);
  });

  it('sets leaf values and joined surface forms', () => {
    const leaf = ml.children!.find(n => n.name === 'neural network')!;
    expect(leaf.values).toEqual({ relevance: 0.4, coverage: 0.1, count: 2 });
    expect(leaf.meta).toEqual({ forms: 'neural network, Neural Network' });
    expect(leaf.children).toBeUndefined();
  });

  it('repeats shared leaves under each assigning concept', () => {
    expect(ml.children!.map(n => n.name)).toEqual(['neural network', 'training data']);
    expect(acme.children!.map(n => n.name)).toEqual(['training data', 'launch site']);
  });
});


describe('tree_schema', () => {
  it('applies defaults for missing values and meta', () => {
    const tree = tree_schema.parse(
      { version: 1, title: 't', values: [], root: { name: 'r' } });
    expect(tree.root.values).toEqual({});
    expect(tree.root.meta).toEqual({});
  });

  it.each([
    ['missing root name', { version: 1, title: 't', values: [], root: {} }],
    ['bad version', { version: 2, title: 't', values: [], root: { name: 'r' } }],
    ['non-numeric value', { version: 1, title: 't', values: [],
      root: { name: 'r', values: { size: 'big' } } }],
    ['invalid child', { version: 1, title: 't', values: [],
      root: { name: 'r', children: [{ href: '#x' }] } }],
  ])('rejects %s', (_case, data) => {
    expect(() => tree_schema.parse(data)).toThrow();
  });
});


describe('load_tree', () => {
  it('reads and validates a tree JSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'graphly-'));
    const path = join(dir, 'graph.json');
    writeFileSync(path, JSON.stringify({ version: 1, title: 't', values: ['count'],
      root: { name: 'r', values: { count: 1 } } }));
    expect(load_tree(path).root.values.count).toBe(1);
  });
});
