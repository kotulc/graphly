/**
 * Unit tests for the Taggly client: HTTP commands (mocked fetch) and the
 * deterministic local placeholders for planned commands.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TagglyClient } from '../src/taggly.js';


const client = new TagglyClient('http://127.0.0.1:8000');

const mock_fetch = (payload: object, ok = true) => {
  const mock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => payload });
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => vi.unstubAllGlobals());


describe('keys', () => {
  it('posts content with config query params and returns keywords', async () => {
    const mock = mock_fetch({ keywords: ['alpha', 'beta'] });
    const result = await client.keys('some text', 5, 2);
    expect(result).toEqual(['alpha', 'beta']);
    const [url, options] = mock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8000/keys?top_n=5&ngram_max=2');
    expect(JSON.parse(options.body)).toEqual({ content: 'some text' });
  });

  it('throws on a failed response', async () => {
    mock_fetch({}, false);
    await expect(client.keys('text', 5)).rejects.toThrow(/keys/);
  });
});


describe('ents', () => {
  it('posts content and returns entities', async () => {
    const mock = mock_fetch({ entities: ['Acme Corp'] });
    const result = await client.ents('some text', 3);
    expect(result).toEqual(['Acme Corp']);
    expect(mock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/ents?top_n=3');
  });
});


describe('score placeholder', () => {
  it('returns 1 for identical token sets', () => {
    expect(client.score('deep learning', 'Deep Learning')).toBe(1);
  });

  it('returns 0 for disjoint token sets', () => {
    expect(client.score('alpha beta', 'gamma delta')).toBe(0);
  });

  it('returns the Jaccard overlap for partial matches', () => {
    expect(client.score('alpha beta', 'alpha gamma')).toBeCloseTo(1 / 3);
  });
});


describe('rel placeholder', () => {
  const relevance = new Map([['alpha beta', 10], ['alpha beta gamma', 9], ['delta', 5]]);
  const candidates = ['alpha beta', 'alpha beta gamma', 'delta'];

  it('selects the most relevant candidate first', () => {
    expect(client.rel(candidates, relevance, 1)).toEqual(['alpha beta']);
  });

  it('penalizes near-duplicates of already selected candidates', () => {
    // Plain relevance ranking would pick 'alpha beta gamma'; MMR prefers diverse 'delta'
    expect(client.rel(candidates, relevance, 2)).toEqual(['alpha beta', 'delta']);
  });

  it('caps selection at top_n and is deterministic', () => {
    expect(client.rel(candidates, relevance, 10).length).toBe(3);
    expect(client.rel(candidates, relevance, 2)).toEqual(client.rel(candidates, relevance, 2));
  });
});


describe('ext placeholders', () => {
  it('extracts frequent non-stop-word tokens in order', () => {
    const text = 'the rocket engine fired and the rocket flew while the engine roared on';
    expect(client.ext_tags(text, 2)).toEqual(['engine', 'rocket']);
  });

  it('emits a relation for tags sharing an identical reference', () => {
    const refs = new Map([['a', ['shared gram', 'x']], ['b', ['shared gram']], ['c', ['y']]]);
    expect(client.ext_relations(refs)).toEqual([{ source: 'a', target: 'b', type: 'co_occurs' }]);
  });
});
