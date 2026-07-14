/**
 * Configuration schema and loading: YAML config file values merged with CLI
 * flag overrides (flags take precedence over file values).
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';


export const config_schema = z.object({
  output: z.string().default('graph.json'),
  max_concepts: z.number().int().positive().default(16),
  max_keys: z.number().int().positive().default(128),
  max_topics: z.number().int().positive().default(8),
  max_leaves: z.number().int().positive().default(32),
  taggly_url: z.url().default('http://127.0.0.1:8000'),
  show_edges: z.boolean().default(true),
  color_by: z.enum(['category', 'weight']).default('category'),
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
