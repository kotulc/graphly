#!/usr/bin/env node
/**
 * graphly CLI: generate a document knowledge graph JSON from a text document,
 * or launch the viewer for an existing graph file. Flags override YAML config.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';

import { Config, load_config } from './config.js';
import { generate_graph } from './pipeline.js';
import { connect_taggly } from './taggly.js';
import { serve_viewer } from './viewer.js';


const program = new Command('graphly')
  .description('Document knowledge graph generator built on Taggly and Graphology');

program.argument('<input>', 'text document to graph')
  .option('--config <path>', 'path to YAML config file')
  .option('--output <path>', 'output file path')
  .option('--max-concepts <n>', 'maximum number of concept nodes')
  .option('--max-keys <n>', 'maximum number of leaf keyword nodes')
  .option('--max-topics <n>', 'maximum number of document topics')
  .option('--max-leaves <n>', 'maximum leaf nodes per concept')
  .option('--taggly-url <url>', 'running taggly api instance (http://<host>:<port>)')
  .action(async (input, options) => {
    const config = load_config(options.config, flags_from(options));
    const text = readFileSync(input, 'utf8');
    const client = await connect_taggly(config.taggly_url);

    const graph = await generate_graph(text, input, config, client);
    writeFileSync(config.output, JSON.stringify(graph, null, 2));
    console.log(`wrote ${graph.nodes!.length} nodes and ${graph.edges!.length} edges`
                + ` to ${config.output}`);
  });

program.command('view <graph-file>')
  .description('launch the graph viewer for a graph JSON file')
  .option('--config <path>', 'path to YAML config file')
  .option('--port <n>', 'viewer server port')
  .option('--show-edges', 'show edges (hidden by default)')
  .action((graph_file, options) => {
    // The root command claims --config when given before/after the subcommand
    const config_path = options.config ?? program.opts().config;
    const config = load_config(config_path, flags_from(options));
    serve_viewer(graph_file, config);
    console.log(`viewing ${graph_file} at http://127.0.0.1:${config.port} (ctrl-c to stop)`);
  });

program.parseAsync().catch(error => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});


/** Map commander's camelCase options onto defined config keys only. */
function flags_from(options: Record<string, string | boolean | undefined>): Partial<Config> {
  const number_or = (value: unknown) => value === undefined ? undefined : Number(value);
  return {
    output: options.output as string | undefined,
    max_concepts: number_or(options.maxConcepts),
    max_keys: number_or(options.maxKeys),
    max_topics: number_or(options.maxTopics),
    max_leaves: number_or(options.maxLeaves),
    taggly_url: options.tagglyUrl as string | undefined,
    port: number_or(options.port),
    show_edges: options.showEdges ? true : undefined,
  };
}
