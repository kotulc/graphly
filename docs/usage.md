# graphly Usage Guide

graphly turns a single text document into a knowledge graph JSON file using
[Taggly](https://github.com/kotulc/taggly) for tag and keyword extraction and
[Graphology](https://graphology.github.io/) for the graph structure, with a minimal
[Sigma.js](https://www.sigmajs.org/) viewer for exploring the result.


## Requirements

- Node.js 18+ (built-in `fetch` is required; developed on Node 22)
- A running [Taggly](https://github.com/kotulc/taggly) API instance, local or remote

graphly talks to Taggly over its HTTP API and never installs or spawns Taggly itself.
Point graphly at the instance's host and port via `taggly_url` (default
`http://127.0.0.1:8000`); if nothing answers there, graphly exits with an error.

```bash
# Local: install taggly (pip install -e <taggly-checkout>) and start the server
taggly start          # serves http://127.0.0.1:8000
```

**Docker alternative** — fully isolated, works on any machine with Docker:
```bash
docker build -t taggly <taggly-checkout>
docker run --rm -p 8000:8000 \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN taggly
```

The first request may be slow while Taggly lazily loads its models; set Taggly's `WARMUP`
env var to pre-load them at server startup.


## Installation

```bash
npm install
npm run build      # compiles to dist/; `npm run graphly -- <args>` runs from source
```


## Quickstart

```bash
# Generate a graph from any non-binary text document (.md, .txt, .py, ...)
graphly document.md

# Use a Taggly instance on another host or port
graphly document.md --taggly-url http://192.168.1.20:8000

# Generate with custom limits
graphly document.md --max-concepts 8 --max-keys 30 --output doc-graph.json

# Explore the result at http://127.0.0.1:3000
graphly view doc-graph.json
```


## Configuration

All options can be set in a YAML config file (`--config path.yaml`) or as CLI flags.
Flags take precedence over file values.

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--output <path>` | `output` | `graph.json` | Output file path |
| `--max-concepts <n>` | `max_concepts` | `10` | Maximum number of concept nodes |
| `--max-keys <n>` | `max_keys` | `20` | Maximum number of leaf keyword nodes |
| `--max-topics <n>` | `max_topics` | `5` | Maximum number of document topics |
| `--max-leaves <n>` | `max_leaves` | `5` | Maximum leaf nodes per concept |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance (`http://<host>:<port>`) |

Example `config.yaml`:

```yaml
output: doc-graph.json
max_concepts: 8
max_keys: 30
max_leaves: 5
taggly_url: http://127.0.0.1:8000
```


## Output

The output JSON follows the
[Graphology serialization schema](https://graphology.github.io/serialization.html)
and can be loaded with `Graph.from(data)`. Nodes are exported in order:
topic root → concepts → leaves.

**Topic (root) node** (`category: topic`, id: `#topic`):
- `key`: document filename
- `label`: most relevant topic (`topics[0]`)
- `description`: generated natural-language description
- `topics`: ranked topic list
- `children`: list of concept node keys

**Concept nodes** (`category: concept`, up to `max_concepts`):
- `key`: concept label (entity, keyword, or other concept from Taggly `tags`)
- `children`: list of leaf node keys (up to `max_leaves`)

**Leaf nodes** (`category: keyword`, up to `max_keys` total):
- `key`: keyword or n-gram phrase extracted directly from the document
- `forms`: unique surface form variants found in the document text
- `children`: `[]`

**Edges** (`category: contains`): every edge is a directed hierarchy edge mirroring the
source node's `children` attribute — root→concept for each concept node, and concept→leaf
for each of the concept's top `max_leaves` most relevant keywords. A leaf shared by several
concepts receives one incoming edge from each, so graphs typically have more edges than
nodes; keyword candidates that rank into no concept's children are dropped from the graph.


## Viewer

```bash
graphly view graph.json [--port 3000] [--color-by category] [--hide-edges]
```

Serves a single-page Sigma.js explorer (no build step; libraries load from CDN).
Node size reflects the node level (root largest, leaves smallest). The side panel
lists all node categories with their assigned palette color.

- `color_by: category` (default) colors each node category distinctly
- `show_edges: false` (or `--hide-edges`) hides all edges
