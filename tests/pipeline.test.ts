/**
 * Integration tests for the full document graph pipeline using a stubbed
 * Taggly client (no HTTP, no real models).
 */

import { describe, expect, it } from 'vitest';

import { generate_graph } from '../src/pipeline.js';
import { load_config } from '../src/config.js';
import { TagglyClient } from '../src/taggly.js';


// Stub overrides the HTTP commands with canned tags; placeholders stay real
class StubClient extends TagglyClient {
  async keys(content: string, top_n: number): Promise<string[]> {
    if (top_n === 1) return [content.split(',')[0].trim().split(' ')[0]];
    return ['rocket engine', 'rocket', 'neural network', 'training data'];
  }

  async ents(content: string, top_n: number): Promise<string[]> {
    return ['Acme'];
  }
}


const client = new StubClient('http://127.0.0.1:8000');

const text = `Acme built a rocket engine at the launch site. The rocket engine fired
while the neural network processed training data. Acme trained the neural network
on training data near the launch site, and the rocket engine roared.`;


describe('generate_graph', () => {
  it('produces a serialized graph with root, cluster, and leaf nodes', async () => {
    const config = load_config(undefined, { max_clusters: 2, max_leaves: 3 });
    const graph = await generate_graph(text, config, client);
    const types = graph.nodes!.map(node => (node.attributes as any).type);

    expect(types.filter(t => t === 'root').length).toBe(1);
    expect(types.filter(t => t === 'cluster').length).toBeLessThanOrEqual(2);
    expect(types).toContain('keyword');
    expect(graph.nodes!.length).toBeLessThanOrEqual(1 + 2 + 2 * 3);
  });

  it('respects max_refs and leaves weights partial by default', async () => {
    const config = load_config(undefined, { max_refs: 2 });
    const graph = await generate_graph(text, config, client);
    const root = graph.nodes!.find(node => (node.attributes as any).type === 'root');
    const leaves = graph.nodes!.filter(node => (node.attributes as any).refs);

    leaves.forEach(node => expect((node.attributes as any).refs.length).toBeLessThanOrEqual(2));
    expect((root!.attributes as any).weight).toBeLessThan(1);
  });

  it('normalizes leaf weights to sum to 1 when configured', async () => {
    const config = load_config(undefined, { normalize: true });
    const graph = await generate_graph(text, config, client);
    const root = graph.nodes!.find(node => (node.attributes as any).type === 'root');

    expect((root!.attributes as any).weight).toBeCloseTo(1, 2);
  });

  it('adds similarity and relation edges only when configured', async () => {
    const base = await generate_graph(text, load_config(), client);
    const config = load_config(undefined, { similarity: 0.1, extract_relations: true });
    const extended = await generate_graph(text, config, client);

    const edge_types = (graph: any) => new Set(graph.edges.map((e: any) => e.attributes.type));
    expect(edge_types(base)).toEqual(new Set(['contains']));
    expect(edge_types(extended).has('related')).toBe(true);
    expect(edge_types(extended).has('co_occurs')).toBe(true);
  });
});
