/**
 * Configuration schema and loading: YAML config file values merged with CLI
 * flag overrides (flags take precedence over file values).
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';


export const config_schema = z.object({
  output: z.string().default('graph.json'),
  max_clusters: z.number().int().positive().default(12),
  max_leaves: z.number().int().positive().default(24),
  max_refs: z.number().int().positive().default(36),
  ngrams: z.array(z.number().int().positive()).default([1, 2, 3]),
  tag_types: z.array(z.string()).default(['keyword', 'entity']),
  similarity: z.number().min(0).max(1).optional(),
  extract_relations: z.boolean().default(false),
  normalize: z.boolean().default(false),
  cluster_colors: z.record(z.string(), z.string()).default({}),
  taggly_url: z.url().default('http://127.0.0.1:8000'),
  show_edges: z.boolean().default(true),
  color_by: z.enum(['cluster', 'weight']).default('cluster'),
  port: z.number().int().positive().default(3000),
});

export type Config = z.infer<typeof config_schema>;


/** Load and validate config from an optional YAML file plus defined flag overrides. */
export function load_config(path?: string, overrides: Partial<Config> = {}): Config {
  const file_values = path ? parse(readFileSync(path, 'utf8')) ?? {} : {};
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined));
  return config_schema.parse({ ...file_values, ...defined });
}
