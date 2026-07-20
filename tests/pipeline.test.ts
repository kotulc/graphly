/**
 * Integration tests for the document tree pipeline using a stubbed Taggly client.
 */

import { describe, expect, it } from 'vitest';

import { generate_graph } from '../src/pipeline.js';
import { load_config } from '../src/config.js';
import { TagglyClient } from '../src/taggly.js';
import { tree_schema, TreeNode } from '../src/tree.js';


class StubClient extends TagglyClient {
  async tags(_content: string, _top_n: number, _concepts: string
  ): Promise<Record<string, string[]>> {
    return {
      concepts: ['machine learning', 'rocket engine'],
      entities: ['Acme Corp'],
      keywords: ['neural network', 'launch site'],
      topics: ['artificial intelligence', 'aerospace'],
      ranked: ['machine learning', 'Acme Corp', 'artificial intelligence',
               'rocket engine', 'aerospace', 'neural network'],
    };
  }
  async desc(_content: string): Promise<string> {
    return 'A document about AI and rockets.';
  }
  async keys(_content: string, top_n: number, _ngram_max: number): Promise<string[]> {
    return ['neural network', 'training data', 'launch site', 'rocket engine'].slice(0, top_n);
  }
  async rank(_query: string, candidates: string[], top_n: number): Promise<string[]> {
    return candidates.slice(0, top_n);
  }
  async score(_query: string, candidates: string[]): Promise<number[]> {
    return candidates.map((_, i) => 1 - i * 0.25);
  }
}


const client = new StubClient('http://127.0.0.1:8000');

const text = `Acme Corp built a rocket engine at the launch site. The rocket engine fired
while the neural network processed training data. Acme trained the neural network
on training data near the launch site, and the rocket engine roared.`;

const leaves_of = (tree: { root: TreeNode }): TreeNode[] =>
  (tree.root.children ?? []).flatMap(concept => concept.children ?? []);


describe('generate_graph', () => {
  it('produces a valid tree file with the standard value names', async () => {
    const config = load_config(undefined, { max_concepts: 3, max_keys: 4, max_leaves: 2 });
    const tree = await generate_graph(text, 'test.md', config, client);
    expect(() => tree_schema.parse(tree)).not.toThrow();
    expect(tree.values).toEqual(['relevance', 'coverage', 'count']);
  });

  it('names the root after the first topic and keeps the description in meta', async () => {
    const config = load_config(undefined, { max_topics: 2 });
    const tree = await generate_graph(text, 'test.md', config, client);
    expect(tree.root.name).toBe('artificial intelligence');
    expect(tree.title).toBe('artificial intelligence');
    expect(tree.root.meta.description).toBe('A document about AI and rockets.');
  });

  it('selects concepts only from configured categories, excluding topics and keywords', async () => {
    const config = load_config(undefined, { max_concepts: 6 });
    const tree = await generate_graph(text, 'test.md', config, client);
    // 'neural network' is only in the keywords group; topics never become concepts
    expect(tree.root.children!.map(n => n.name))
      .toEqual(['machine learning', 'Acme Corp', 'rocket engine']);
  });

  it('records each concept tag category in meta', async () => {
    const config = load_config(undefined, { max_concepts: 6 });
    const tree = await generate_graph(text, 'test.md', config, client);
    const category_of = new Map(tree.root.children!.map(n => [n.name, n.meta.category]));
    expect(category_of.get('machine learning')).toBe('concepts');
    expect(category_of.get('Acme Corp')).toBe('entities');
  });

  it('scores every node with a relevance value, root fully relevant', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const tree = await generate_graph(text, 'test.md', config, client);
    expect(tree.root.values.relevance).toBe(1);
    tree.root.children!.forEach(concept => {
      expect(concept.values.relevance).toBeGreaterThan(0);
      expect(concept.values.relevance).toBeLessThanOrEqual(1);
    });
    leaves_of(tree).forEach(leaf => expect(leaf.values.relevance).toBeDefined());
  });

  it('assigns coverage values: root greatest, leaves carry occurrence counts', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const tree = await generate_graph(text, 'test.md', config, client);
    const walk = (node: TreeNode): number[] =>
      [node.values.coverage, ...(node.children ?? []).flatMap(walk)];
    expect(tree.root.values.coverage).toBeGreaterThan(0);
    expect(Math.max(...walk(tree.root))).toBe(tree.root.values.coverage);
    leaves_of(tree).forEach(leaf => expect(leaf.values.count).toBeGreaterThan(0));
  });

  it('respects max_leaves per concept node', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const tree = await generate_graph(text, 'test.md', config, client);
    tree.root.children!.forEach(concept =>
      expect(concept.children!.length).toBeLessThanOrEqual(2));
  });

  it('falls back to the input filename when no topics were extracted', async () => {
    const bare = new class extends StubClient {
      async tags(): Promise<Record<string, string[]>> {
        return { concepts: ['machine learning'], ranked: ['machine learning'] };
      }
    }('http://127.0.0.1:8000');
    const tree = await generate_graph(text, '/path/to/document.md', load_config(), bare);
    expect(tree.root.name).toBe('document.md');
  });
});
