#!/usr/bin/env node
/**
 * graphly CLI: generate a document knowledge graph JSON from a text document,
 * or launch the viewer for an existing graph file. All settings come from the
 * YAML config file (./config.yaml or --config <path>).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { Command } from 'commander';

import { load_config } from './config.js';
import { generate_graph } from './pipeline.js';
import { connect_taggly } from './taggly.js';
import { serve_viewer } from './viewer.js';


const program = new Command('graphly')
  .description('Document knowledge graph generator built on Taggly and Graphology')
  .option('--config <path>', 'path to YAML config file (default: ./config.yaml)');

program.argument('<input>', 'text document to graph')
  .action(async (input) => {
    const config = load_config(program.opts().config);
    const text = readFileSync(input, 'utf8');
    const client = await connect_taggly(config.taggly_url);

    const graph = await generate_graph(text, input, config, client);
    writeFileSync(config.output, JSON.stringify(graph, null, 2));
    console.log(`wrote ${graph.nodes!.length} nodes and ${graph.edges!.length} edges`
                + ` to ${config.output}`);
  });

program.command('view <graph-file>')
  .description('launch the graph viewer for a graph JSON file')
  .action((graph_file) => {
    const config = load_config(program.opts().config);
    serve_viewer(graph_file, config);
    console.log(`viewing ${graph_file} at http://127.0.0.1:${config.port} (ctrl-c to stop)`);
  });

program.parseAsync().catch(error => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});
