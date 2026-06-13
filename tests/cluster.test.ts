/**
 * Unit tests for tag clustering and per-cluster leaf selection.
 */

import { describe, expect, it } from 'vitest';

import { cluster_tags, select_leaves } from '../src/cluster.js';
import { TagglyClient } from '../src/taggly.js';
import { Tag } from '../src/ngrams.js';


const client = new TagglyClient('http://127.0.0.1:8000');

const tag = (key: string, count = 1): Tag => ({ key, type: 'keyword', refs: [], count, weight: 0 });


describe('cluster_tags', () => {
  it('groups token-overlapping tags together', () => {
    const tags = [tag('neural network'), tag('neural model'), tag('rocket fuel'), tag('rocket')];
    const groups = cluster_tags(tags, 2, client);
    const find = (key: string) => groups.findIndex(g => g.some(t => t.key === key));
    expect(groups.length).toBe(2);
    expect(find('neural network')).toBe(find('neural model'));
    expect(find('rocket fuel')).toBe(find('rocket'));
  });

  it('caps the number of clusters at the tag count', () => {
    const groups = cluster_tags([tag('a'), tag('b')], 12, client);
    expect(groups.length).toBeLessThanOrEqual(2);
  });

  it('returns no groups for no tags and one group for one tag', () => {
    expect(cluster_tags([], 12, client)).toEqual([]);
    expect(cluster_tags([tag('solo')], 12, client).length).toBe(1);
  });

  it('is deterministic across runs', () => {
    const tags = [tag('a b'), tag('a c'), tag('d e'), tag('d f'), tag('g h')];
    expect(cluster_tags(tags, 3, client)).toEqual(cluster_tags(tags, 3, client));
  });
});


describe('select_leaves', () => {
  it('caps selection at max_leaves preferring high counts', () => {
    const group = [tag('alpha', 1), tag('beta', 10), tag('gamma', 5)];
    const leaves = select_leaves(group, 2, client);
    expect(leaves.length).toBe(2);
    expect(leaves.some(t => t.key === 'beta')).toBe(true);
  });

  it('returns the whole group when under the limit', () => {
    const group = [tag('alpha'), tag('beta')];
    expect(select_leaves(group, 24, client).length).toBe(2);
  });
});
