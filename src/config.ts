/**
 * Configuration schema and loading: YAML config file values merged with CLI
 * flag overrides (flags take precedence over file values). When no --config
 * path is given, a config.yaml in the working directory is used if present.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';


export const config_schema = z.object({
  output: z.string().default('graph.json'),
  concepts: z.array(z.string()).default(['concepts', 'entities']),
  max_concepts: z.number().int().positive().default(16),
  max_keys: z.number().int().positive().default(128),
  max_topics: z.number().int().positive().default(8),
  max_leaves: z.number().int().positive().default(32),
  max_ngram: z.number().int().positive().default(1),
  taggly_url: z.url().default('http://127.0.0.1:8000'),
  show_edges: z.boolean().default(false),
  colormaps: z.array(z.string()).default(['YlOrBr']),
  port: z.number().int().positive().default(3000),
});

export type Config = z.infer<typeof config_schema>;


/** Load and validate config from an optional YAML file plus defined flag overrides. */
export function load_config(path?: string, overrides: Partial<Config> = {}): Config {
  const file = path ?? (existsSync('config.yaml') ? 'config.yaml' : undefined);
  const file_values = file ? parse(readFileSync(file, 'utf8')) ?? {} : {};
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined));
  return config_schema.parse({ ...file_values, ...defined });
}
