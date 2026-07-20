/**
 * Viewer server: a minimal static server exposing the sample viewer page, the
 * tree data file, and the shared component modules it renders with.
 */

import { readFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Config } from './config.js';


const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');


/** Serve the viewer page, tree data file, and component modules on config.port. */
export function serve_viewer(graph_path: string, config: Config): Server {
  const server = createServer((request, response) => {
    const url = request.url ?? '';
    const send = (type: string, body: Buffer) =>
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);

    try {
      if (url === '/') return send('text/html', readFileSync(join(ROOT, 'viewer', 'index.html')));
      if (url === '/graph.json') return send('application/json', readFileSync(graph_path));
      if (url.startsWith('/component/') && url.endsWith('.js'))  // basename bars traversal
        return send('text/javascript', readFileSync(join(ROOT, 'component', basename(url))));
    } catch { /* fall through to 404 */ }
    response.writeHead(404).end();
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(error.code === 'EADDRINUSE'
      ? `error: port ${config.port} is already in use — set another 'port' in the config`
      : `error: ${error.message}`);
    process.exit(1);
  });
  return server.listen(config.port);
}
