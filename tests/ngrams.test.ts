/**
 * Unit tests for n-gram extraction and tag anchoring.
 */

import { describe, expect, it } from 'vitest';

import { anchor_tags, extract_ngrams, tokenize } from '../src/ngrams.js';


describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Hello, World! Foo-bar.')).toEqual(['hello', 'world', 'foo-bar']);
  });

  it('returns an empty list for empty text', () => {
    expect(tokenize('')).toEqual([]);
  });
});


describe('extract_ngrams', () => {
  it('counts unigrams and bigrams', () => {
    const counts = extract_ngrams(['a', 'b', 'a', 'b'], [1, 2]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('a b')).toBe(2);
    expect(counts.get('b a')).toBe(1);
  });

  it('skips sizes longer than the token stream', () => {
    expect(extract_ngrams(['a'], [2]).size).toBe(0);
  });
});


describe('anchor_tags', () => {
  const counts = extract_ngrams(tokenize('deep learning models use deep learning'), [1, 2]);

  it('sums occurrences across all matching n-grams', () => {
    const [tag] = anchor_tags([{ key: 'deep learning', type: 'keyword' }], counts, 10);
    // 'deep learning' x2, 'learning models' n/a; matches: 'deep learning'(2) bigram only
    expect(tag.count).toBeGreaterThanOrEqual(2);
    expect(tag.refs[0]).toBe('deep learning');
  });

  it('caps refs at max_refs and orders by count', () => {
    const [tag] = anchor_tags([{ key: 'deep', type: 'keyword' }], counts, 2);
    expect(tag.refs.length).toBeLessThanOrEqual(2);
    expect(tag.refs[0]).toBe('deep');
  });

  it('drops tags without any matching n-gram', () => {
    expect(anchor_tags([{ key: 'missing', type: 'keyword' }], counts, 5)).toEqual([]);
  });

  it('matches whole tokens only', () => {
    const sub_counts = extract_ngrams(tokenize('maintain the system'), [1]);
    expect(anchor_tags([{ key: 'ai', type: 'keyword' }], sub_counts, 5)).toEqual([]);
  });

  it('deduplicates tags by normalized key keeping the first type', () => {
    const tags = anchor_tags(
      [{ key: 'Deep Learning', type: 'entity' }, { key: 'deep learning', type: 'keyword' }],
      counts, 5);
    expect(tags.length).toBe(1);
    expect(tags[0].type).toBe('entity');
  });
});
