/**
 * Integration tests for the document graph pipeline using a stubbed Taggly client.
 */

import { describe, expect, it } from 'vitest';

import { generate_graph } from '../src/pipeline.js';
import { load_config } from '../src/config.js';
import { Tag, TagglyClient } from '../src/taggly.js';


class StubClient extends TagglyClient {
  async tags(_content: string, top_n: number): Promise<Tag[]> {
    return [
      { key: 'machine learning', type: 'keyword' },
      { key: 'Acme Corp', type: 'entity' },
    ].slice(0, top_n);
  }
  async desc(_content: string): Promise<string> {
    return 'A document about AI and rockets.';
  }
  async topics(_documents: string[], top_n: number): Promise<string[]> {
    return ['machine learning', 'aerospace', 'neural networks'].slice(0, top_n);
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
  it('produces a graph with doc, tag, and leaf node types', async () => {
    const config = load_config(undefined, { max_tags: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const types = graph.nodes!.map((n: any) => n.attributes.type);

    expect(types.filter(t => t === 'doc').length).toBe(1);
    expect(types).toContain('keyword');
    expect(types).toContain('entity');
  });

  it('sets the doc label to the first topic', async () => {
    const config = load_config(undefined, { max_topics: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const doc = graph.nodes!.find((n: any) => n.attributes.type === 'doc');
    expect(doc!.attributes!.label).toBe('machine learning');
  });

  it('exports nodes in order: doc, tags, leaves', async () => {
    const config = load_config(undefined, { max_tags: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    const nodes = graph.nodes!;
    expect(nodes[0].attributes!.type).toBe('doc');
    // Leaf nodes have 'forms' (tags do not); all tag nodes must precede all leaf nodes
    const is_leaf = (n: any) => Array.isArray(n.attributes.forms);
    let saw_leaf = false;
    for (const node of nodes.slice(1)) {
      if (is_leaf(node)) saw_leaf = true;
      expect(saw_leaf && !is_leaf(node)).toBe(false);
    }
  });

  it('leaf nodes carry forms arrays from document text', async () => {
    const config = load_config(undefined, { max_tags: 1, max_keys: 2, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    // Leaf nodes are distinguished by the presence of the 'forms' attribute
    const leaves = graph.nodes!.filter((n: any) => Array.isArray(n.attributes.forms));
    expect(leaves.length).toBeGreaterThan(0);
    leaves.forEach((n: any) => expect(Array.isArray(n.attributes.forms)).toBe(true));
  });

  it('respects max_leaves per tag node', async () => {
    const config = load_config(undefined, { max_tags: 2, max_keys: 4, max_leaves: 2 });
    const graph = await generate_graph(text, 'test.md', config, client);
    // Tag nodes have a 'children' array but no 'forms' attribute
    const tags = graph.nodes!.filter(
      (n: any) => !Array.isArray(n.attributes.forms) && n.attributes.type !== 'doc');
    tags.forEach((n: any) => expect(n.attributes.children.length).toBeLessThanOrEqual(2));
  });

  it('sets doc key to the input filename', async () => {
    const config = load_config();
    const graph = await generate_graph(text, '/path/to/document.md', config, client);
    const doc = graph.nodes!.find((n: any) => n.attributes.type === 'doc');
    expect(doc!.attributes!.key).toBe('document.md');
  });
});
