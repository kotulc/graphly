/**
 * Unit tests for config loading: defaults, YAML files, and CLI flag precedence.
 */

import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { config_schema, load_config } from '../src/config.js';


const config_path = join(tmpdir(), 'graphly-test-config.yaml');
writeFileSync(config_path, 'max_concepts: 4\noutput: out.json\n');

afterAll(() => rmSync(config_path, { force: true }));


describe('load_config', () => {
  it('applies schema defaults', () => {
    const config = config_schema.parse({});
    expect(config.concepts).toEqual(['concepts', 'entities']);
    expect(config.max_concepts).toBe(16);
    expect(config.max_keys).toBe(128);
    expect(config.max_topics).toBe(8);
    expect(config.max_leaves).toBe(32);
    expect(config.max_ngram).toBe(1);
    expect(config.taggly_url).toBe('http://127.0.0.1:8000');
    expect(config.port).toBe(3000);
  });

  it('reads values from a YAML config file', () => {
    const config = load_config(config_path);
    expect(config.max_concepts).toBe(4);
    expect(config.output).toBe('out.json');
  });

  it('prefers flag overrides to config file values', () => {
    const config = load_config(config_path, { max_concepts: 2, max_leaves: 3 });
    expect(config.max_concepts).toBe(2);
    expect(config.max_leaves).toBe(3);
    expect(config.output).toBe('out.json');
  });

  it('ignores undefined flag overrides', () => {
    const config = load_config(config_path, { max_concepts: undefined });
    expect(config.max_concepts).toBe(4);
  });

  it('rejects out-of-range values', () => {
    expect(() => load_config(undefined, { max_concepts: 0 })).toThrow();
    expect(() => load_config(undefined, { max_keys: -1 })).toThrow();
  });
});
