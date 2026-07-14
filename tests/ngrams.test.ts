/**
 * Unit tests for surface form extraction and coverage counting.
 */

import { describe, expect, it } from 'vitest';

import { count_matches, count_words, find_forms } from '../src/ngrams.js';


describe('find_forms', () => {
  it('finds all case variants of a multi-word keyword', () => {
    const forms = find_forms('machine learning', 'Machine Learning powers deep machine learning.');
    expect(forms).toContain('Machine Learning');
    expect(forms).toContain('machine learning');
    expect(forms.length).toBe(2);
  });

  it('returns an empty array when the keyword is not present', () => {
    expect(find_forms('neural network', 'machine learning is useful')).toEqual([]);
  });

  it('matches whole words only, not substrings', () => {
    const forms = find_forms('AI', 'AISystem trains AI models for AIR quality.');
    expect(forms).toEqual(['AI']);
  });

  it('finds single-word keyword variants', () => {
    const forms = find_forms('rocket', 'The Rocket launched. A rocket engine fired.');
    expect(forms).toContain('Rocket');
    expect(forms).toContain('rocket');
    expect(forms.length).toBe(2);
  });

  it('deduplicates repeated identical forms', () => {
    const forms = find_forms('data', 'training data and test data and more data');
    expect(forms).toEqual(['data']);
  });
});


describe('count_matches', () => {
  it('counts every whole-word occurrence across case variants', () => {
    expect(count_matches('data', 'training data and test Data and more data')).toBe(3);
  });

  it('returns zero when the keyword is not present', () => {
    expect(count_matches('rocket', 'machine learning is useful')).toBe(0);
  });
});


describe('count_words', () => {
  it('counts whitespace-delimited words', () => {
    expect(count_words('one two  three\nfour')).toBe(4);
  });

  it('returns zero for empty text', () => {
    expect(count_words('')).toBe(0);
  });
});
