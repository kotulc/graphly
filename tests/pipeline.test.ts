/**
 * Integration tests for the document graph pipeline using a stubbed Taggly client.
 */

import { describe, expect, it } from 'vitest';

import { generate_graph } from '../src/pipeline.js';
import { load_config } from '../src/config.js';
import { TagglyClient } from '../src/taggly.js';


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
  async keys(_content: string, top_n: number): Promise<string[]> {
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


describe('generate_graph', () => {
  it('produces a graph with topic, concept, and keyword categories', async () => {
    const config = load_config(undefined, { max_concepts: 3, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const categories = graph.nodes!.map((n: any) => n.attributes.category);

    expect(categories.filter(c => c === 'topic').length).toBe(1);
    expect(categories).toContain('concepts');
    expect(categories).toContain('entities');
    expect(categories).toContain('keyword');
  });

  it('sets the root label to the first topic', async () => {
    const config = load_config(undefined, { max_topics: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const root = graph.nodes!.find((n: any) => n.attributes.category === 'topic');
    expect(root!.attributes!.label).toBe('artificial intelligence');
  });

  it('selects concepts only from configured categories, excluding topics and keywords', async () => {
    const config = load_config(undefined, { max_concepts: 6 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const concepts = graph.nodes!
      .filter((n: any) => !['topic', 'keyword'].includes(n.attributes.category))
      .map((n: any) => n.attributes.key);
    // 'neural network' is only in the keywords group; topics never become concepts
    expect(concepts).toEqual(['machine learning', 'Acme Corp', 'rocket engine']);
  });

  it('assigns each concept the category of its tag group', async () => {
    const config = load_config(undefined, { max_concepts: 6 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const category_of = new Map(
      graph.nodes!.map((n: any) => [n.attributes.key, n.attributes.category]));
    expect(category_of.get('machine learning')).toBe('concepts');
    expect(category_of.get('Acme Corp')).toBe('entities');
  });

  it('writes only root->concept edges, weighted by concept similarity', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const concept_count = graph.nodes!.filter(
      (n: any) => !['topic', 'keyword'].includes(n.attributes.category)).length;
    expect(graph.edges!.length).toBe(concept_count);
    graph.edges!.forEach((e: any) => {
      expect(e.source).toBe('#topic');
      expect(e.attributes.weight).toBeLessThanOrEqual(1);
    });
  });

  it('assigns document-coverage weights: root greatest, concepts sum their children', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const root = graph.nodes!.find((n: any) => n.attributes.category === 'topic') as any;
    expect(root.attributes.weight).toBeGreaterThan(0);
    graph.nodes!.forEach((n: any) =>
      expect(n.attributes.weight).toBeLessThanOrEqual(root.attributes.weight));
    // Leaves carry occurrence counts from the document text
    const leaves = graph.nodes!.filter((n: any) => n.attributes.category === 'keyword');
    leaves.forEach((n: any) => expect(n.attributes.count).toBeGreaterThan(0));
  });

  it('exports nodes in order: root, concepts, leaves', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const nodes = graph.nodes!;
    expect(nodes[0].attributes!.category).toBe('topic');
    // Leaf nodes have 'forms' (concepts do not); all concepts must precede all leaves
    const is_leaf = (n: any) => Array.isArray(n.attributes.forms);
    let saw_leaf = false;
    for (const node of nodes.slice(1)) {
      if (is_leaf(node)) saw_leaf = true;
      expect(saw_leaf && !is_leaf(node)).toBe(false);
    }
  });

  it('respects max_leaves per concept node', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const concepts = graph.nodes!.filter(
      (n: any) => !['topic', 'keyword'].includes(n.attributes.category));
    concepts.forEach((n: any) => expect(n.attributes.children.length).toBeLessThanOrEqual(2));
  });

  it('sets root key to the input filename', async () => {
    const config = load_config();
    const graph = await generate_graph(text, '/path/to/document.md', config, client);
    const root = graph.nodes!.find((n: any) => n.attributes.category === 'topic');
    expect(root!.attributes!.key).toBe('document.md');
  });
});
