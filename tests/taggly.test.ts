/**
 * Unit tests for the Taggly client: HTTP commands (mocked fetch) and the
 * string-to-typed tag compatibility shim.
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


describe('tags', () => {
  it('parses typed dict response into tag objects in ranked order', async () => {
    const mock = mock_fetch({
      tags: {
        entities: ['Acme Corp'],
        keywords: ['machine learning'],
        ranked: ['machine learning', 'Acme Corp'],
      },
    });
    const result = await client.tags('some text', 5);
    expect(result).toEqual([
      { key: 'machine learning', type: 'keyword' },
      { key: 'Acme Corp', type: 'entity' },
    ]);
    const [url, options] = mock.mock.calls[0];
    expect(url).toContain('tags?top_n=5');
    expect(JSON.parse(options.body)).toEqual({ content: 'some text' });
  });

  it('uses scored order when no ranked list is present', async () => {
    mock_fetch({
      tags: {
        entities: ['Acme Corp'],
        keywords: ['machine learning'],
        scored: ['Acme Corp', 'machine learning'],
      },
    });
    const result = await client.tags('some text', 5);
    expect(result[0]).toEqual({ key: 'Acme Corp', type: 'entity' });
  });

  it('caps results at top_n', async () => {
    mock_fetch({
      tags: {
        keywords: ['a', 'b', 'c'],
        ranked: ['a', 'b', 'c'],
      },
    });
    const result = await client.tags('some text', 2);
    expect(result.length).toBe(2);
  });

  it('falls back to legacy plain string array by assigning type keyword', async () => {
    mock_fetch({ tags: ['alpha', 'beta'] });
    const result = await client.tags('some text', 5);
    expect(result).toEqual([
      { key: 'alpha', type: 'keyword' },
      { key: 'beta', type: 'keyword' },
    ]);
  });

  it('throws on a failed response', async () => {
    mock_fetch({}, false);
    await expect(client.tags('text', 5)).rejects.toThrow(/tags/);
  });
});


describe('desc', () => {
  it('posts content and returns the description string', async () => {
    mock_fetch({ description: 'A text about AI.' });
    expect(await client.desc('some text')).toBe('A text about AI.');
  });
});


describe('topics', () => {
  it('posts documents array and returns topics list', async () => {
    const mock = mock_fetch({ topics: ['machine learning', 'AI'] });
    const result = await client.topics(['desc text', 'tag1, tag2', 'full doc'], 3);
    expect(result).toEqual(['machine learning', 'AI']);
    const call_body = JSON.parse(mock.mock.calls[0][1].body);
    expect(call_body.documents).toHaveLength(3);
  });
});


describe('keys', () => {
  it('posts content and returns keywords list', async () => {
    const mock = mock_fetch({ keywords: ['alpha', 'beta'] });
    const result = await client.keys('some text', 5);
    expect(result).toEqual(['alpha', 'beta']);
    expect(mock.mock.calls[0][0]).toContain('keys?top_n=5');
  });
});


describe('rank', () => {
  it('posts query and candidates and returns ranked list', async () => {
    const mock = mock_fetch({ ranked: ['beta', 'alpha'] });
    const result = await client.rank('query text', ['alpha', 'beta'], 2);
    expect(result).toEqual(['beta', 'alpha']);
    const call_body = JSON.parse(mock.mock.calls[0][1].body);
    expect(call_body.query).toBe('query text');
    expect(call_body.candidates).toEqual(['alpha', 'beta']);
    expect(mock.mock.calls[0][0]).toContain('rank?top_n=2');
  });

  it('throws on a failed response', async () => {
    mock_fetch({}, false);
    await expect(client.rank('q', ['a'], 1)).rejects.toThrow(/rank/);
  });
});
