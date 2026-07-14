/**
 * Viewer server: a minimal static server exposing the viewer page, the
 * serialized graph JSON, and viewer settings derived from config.
 */

import { readFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Config } from './config.js';


const VIEWER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'viewer');


/** Serve the viewer page, graph file, and settings on config.port. */
export function serve_viewer(graph_path: string, config: Config): Server {
  const routes: Record<string, [string, () => string | Buffer]> = {
    '/': ['text/html', () => readFileSync(join(VIEWER_DIR, 'index.html'))],
    '/graph.json': ['application/json', () => readFileSync(graph_path)],
    '/settings.json': ['application/json', () => JSON.stringify({
      show_edges: config.show_edges,
      colormaps: config.colormaps,
    })],
  };

  const server = createServer((request, response) => {
    const route = routes[request.url ?? ''];
    if (!route) return void response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': route[0], 'Cache-Control': 'no-store' })
      .end(route[1]());
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE'
      ? `error: port ${config.port} is already in use — choose another with --port`
      : `error: ${error.message}`);
    process.exit(1);
  });
  return server.listen(config.port);
}
