# graphly Usage Guide

graphly turns a single text document into a knowledge graph JSON file using
[Taggly](https://github.com/kotulc/taggly) for tag and keyword extraction and
[Graphology](https://graphology.github.io/) for the graph structure, with a minimal
[Sigma.js](https://www.sigmajs.org/) viewer for exploring the result.


## Requirements

- Node.js 18+ (built-in `fetch` is required; developed on Node 22)
- A sibling [Taggly](https://github.com/kotulc/taggly) checkout at `../taggly`
- [uv](https://docs.astral.sh/uv/) (recommended) — `npm install` sets up the Taggly
  venv automatically; without it, install manually with `pip install -e ../taggly`

graphly talks to Taggly over its HTTP API. If no server is running at `taggly_url`,
graphly spawns `taggly start` from the uv-managed venv at `../taggly/.venv` (falls
back to `taggly` on PATH). The first run is slow while models load. To reuse a
long-lived server across runs — much faster — start one yourself:

```bash
taggly start          # from the ../taggly venv or PATH
```

**Docker alternative** — fully isolated, works on any machine with Docker:
```bash
docker build -t taggly ../taggly
docker run --rm -p 8000:8000 \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN taggly
```
graphly detects a running server at `taggly_url` and skips spawning.


## Installation

```bash
npm install
npm run build      # compiles to dist/; `npm run graphly -- <args>` runs from source
```


## Quickstart

```bash
# Generate a graph from any non-binary text document (.md, .txt, .py, ...)
graphly document.md

# Generate with custom limits
graphly document.md --max-tags 8 --max-keys 30 --output doc-graph.json

# Explore the result at http://127.0.0.1:3000
graphly view doc-graph.json
```

The first spawned run is slow while Taggly loads its extraction models; subsequent
requests against a running server are fast.


## Configuration

All options can be set in a YAML config file (`--config path.yaml`) or as CLI flags.
Flags take precedence over file values.

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--output <path>` | `output` | `graph.json` | Output file path |
| `--max-tags <n>` | `max_tags` | `10` | Maximum number of tag nodes |
| `--max-keys <n>` | `max_keys` | `20` | Maximum number of leaf keyword nodes |
| `--max-topics <n>` | `max_topics` | `5` | Maximum number of document topics |
| `--max-leaves <n>` | `max_leaves` | `5` | Maximum leaf nodes per tag |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance |

Example `config.yaml`:

```yaml
output: doc-graph.json
max_tags: 8
max_keys: 30
max_leaves: 5
taggly_url: http://127.0.0.1:8000
```


## Output

The output JSON follows the
[Graphology serialization schema](https://graphology.github.io/serialization.html)
and can be loaded with `Graph.from(data)`. Nodes are exported in order: doc → tags → leaves.

**Doc node** (`type: doc`, id: `#doc`):
- `key`: document filename
- `label`: most relevant topic (`topics[0]`)
- `description`: generated natural-language description
- `topics`: ranked topic list
- `children`: list of tag node keys

**Tag nodes** (up to `max_tags`):
- `key`: tag label
- `type`: tag category (`entity`, `keyword`, or concept type from Taggly `ext`)
- `children`: list of leaf node keys (up to `max_leaves`)

**Leaf nodes** (up to `max_keys` total):
- `key`: keyword or n-gram phrase
- `type`: `keyword`
- `forms`: unique surface form variants found in the document text
- `children`: `[]`

`contains` hierarchy edges (doc→tag, tag→leaf) are always written.


## Viewer

```bash
graphly view graph.json [--port 3000] [--color-by type] [--hide-edges]
```

Serves a single-page Sigma.js explorer (no build step; libraries load from CDN).
Node size reflects the node level (doc largest, leaves smallest). The side panel
lists all node types with their assigned palette color.

- `color_by: type` (default) colors each node type distinctly
- `show_edges: false` (or `--hide-edges`) hides all edges
