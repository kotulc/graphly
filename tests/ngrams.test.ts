/**
 * Unit tests for surface form extraction.
 */

import { describe, expect, it } from 'vitest';

import { find_forms } from '../src/ngrams.js';


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
