/**
 * Unit tests for config loading: defaults, YAML files, and CLI flag precedence.
 */

import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { load_config } from '../src/config.js';


const config_path = join(tmpdir(), 'graphly-test-config.yaml');
writeFileSync(config_path, 'max_clusters: 4\noutput: out.json\nsimilarity: 0.5\n');

afterAll(() => rmSync(config_path, { force: true }));


describe('load_config', () => {
  it('applies defaults when no file or flags are given', () => {
    const config = load_config();
    expect(config.max_clusters).toBe(12);
    expect(config.max_leaves).toBe(24);
    expect(config.max_refs).toBe(36);
    expect(config.ngrams).toEqual([1, 2, 3]);
    expect(config.normalize).toBe(false);
    expect(config.similarity).toBeUndefined();
    expect(config.taggly_url).toBe('http://127.0.0.1:8000');
  });

  it('reads values from a YAML config file', () => {
    const config = load_config(config_path);
    expect(config.max_clusters).toBe(4);
    expect(config.output).toBe('out.json');
    expect(config.similarity).toBe(0.5);
  });

  it('prefers flag overrides to config file values', () => {
    const config = load_config(config_path, { max_clusters: 2, normalize: true });
    expect(config.max_clusters).toBe(2);
    expect(config.normalize).toBe(true);
    expect(config.output).toBe('out.json');
  });

  it('ignores undefined flag overrides', () => {
    const config = load_config(config_path, { max_clusters: undefined });
    expect(config.max_clusters).toBe(4);
  });

  it('rejects out-of-range values', () => {
    expect(() => load_config(undefined, { similarity: 1.5 })).toThrow();
    expect(() => load_config(undefined, { max_clusters: 0 })).toThrow();
  });
});
