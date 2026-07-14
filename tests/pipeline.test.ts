/**
 * Integration tests for the document graph pipeline using a stubbed Taggly client.
 */

import { describe, expect, it } from 'vitest';

import { generate_graph } from '../src/pipeline.js';
import { load_config } from '../src/config.js';
import { TagglyClient } from '../src/taggly.js';


class StubClient extends TagglyClient {
  async tags(_content: string, _top_n: number): Promise<Record<string, string[]>> {
    return {
      concepts: ['machine learning'],
      entities: ['Acme Corp'],
      keywords: ['rocket engine'],
      topics: ['artificial intelligence', 'aerospace'],
      ranked: ['machine learning', 'Acme Corp', 'artificial intelligence',
               'rocket engine', 'aerospace'],
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
}


const client = new StubClient('http://127.0.0.1:8000');

const text = `Acme Corp built a rocket engine at the launch site. The rocket engine fired
while the neural network processed training data. Acme trained the neural network
on training data near the launch site, and the rocket engine roared.`;


describe('generate_graph', () => {
  it('produces a graph with topic, concept, and keyword node types', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const types = graph.nodes!.map((n: any) => n.attributes.category);

    expect(types.filter(t => t === 'topic').length).toBe(1);
    expect(types).toContain('concept');
    expect(types).toContain('keyword');
  });

  it('sets the root label to the first topic', async () => {
    const config = load_config(undefined, { max_topics: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const root = graph.nodes!.find((n: any) => n.attributes.category === 'topic');
    expect(root!.attributes!.label).toBe('artificial intelligence');
  });

  it('excludes root topics from the concept nodes', async () => {
    const config = load_config(undefined, { max_concepts: 4 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const concepts = graph.nodes!
      .filter((n: any) => n.attributes.category === 'concept')
      .map((n: any) => n.attributes.key);
    expect(concepts).toEqual(['machine learning', 'Acme Corp', 'rocket engine']);
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

  it('leaf nodes carry forms arrays from document text', async () => {
    const config = load_config(undefined, { max_concepts: 1, max_keys: 2, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    // Leaf nodes are distinguished by the presence of the 'forms' attribute
    const leaves = graph.nodes!.filter((n: any) => Array.isArray(n.attributes.forms));
    expect(leaves.length).toBeGreaterThan(0);
    leaves.forEach((n: any) => expect(Array.isArray(n.attributes.forms)).toBe(true));
  });

  it('respects max_leaves per concept node', async () => {
    const config = load_config(undefined, { max_concepts: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const concepts = graph.nodes!.filter((n: any) => n.attributes.category === 'concept');
    concepts.forEach((n: any) => expect(n.attributes.children.length).toBeLessThanOrEqual(2));
  });

  it('sets root key to the input filename', async () => {
    const config = load_config();
    const graph = await generate_graph(text, '/path/to/document.md', config, client);
    const root = graph.nodes!.find((n: any) => n.attributes.category === 'topic');
    expect(root!.attributes!.key).toBe('document.md');
  });
});
