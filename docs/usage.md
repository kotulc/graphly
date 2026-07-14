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

All options can be set in a YAML config file or as CLI flags (flags take precedence).
The repo root `config.yaml` lists every setting with its default value; graphly loads a
`config.yaml` from the working directory automatically when no `--config` path is given.
List settings (`concepts`, `colormaps`) can only be set in the config file.

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--output <path>` | `output` | `graph.json` | Output file path |
| — | `concepts` | `[concepts, entities]` | Tag categories extracted as concept nodes (`topics` is always added for the root; `keywords` is reserved for leaves) |
| `--max-concepts <n>` | `max_concepts` | `16` | Maximum number of concept nodes |
| `--max-keys <n>` | `max_keys` | `128` | Maximum number of leaf keyword nodes |
| `--max-topics <n>` | `max_topics` | `8` | Maximum number of document topics |
| `--max-leaves <n>` | `max_leaves` | `32` | Maximum leaf nodes per concept |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance (`http://<host>:<port>`) |
| `--port <n>` | `port` | `3000` | Viewer server port |
| `--show-edges` | `show_edges` | `false` | Show edges in the viewer (hidden by default) |
| — | `colormaps` | `[YlOrBr]` | d3-scale-chromatic schemes for concept colors |

Example `config.yaml`:

```yaml
output: doc-graph.json
concepts: [concepts, entities]
max_concepts: 8
max_keys: 64
max_leaves: 16
taggly_url: http://127.0.0.1:8000
show_edges: false
colormaps: [YlOrBr]
```

The `concepts` categories are passed straight to Taggly's `tags` command, so any category
its `ext` extraction understands can be used (e.g. `[people, organizations]`); each concept
node's `category` attribute records the category it was extracted as.


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
- `weight`: fraction of document words covered by all leaf keywords — always the greatest
  weight in the graph

**Concept nodes** (up to `max_concepts`):
- `key`: concept label
- `category`: the tag category the concept was extracted as (one of the configured
  `concepts`, e.g. `entities`)
- `children`: list of leaf node keys (up to `max_leaves`)
- `weight`: sum of its children's coverage weights

**Leaf nodes** (`category: keyword`, up to `max_keys` total — the `keyword` category is
reserved for leaves):
- `key`: keyword or n-gram phrase extracted directly from the document
- `forms`: unique surface form variants found in the document text
- `count`: total whole-word occurrences of the keyword in the document
- `weight`: document coverage — `count × words in phrase / total document words`
- `children`: `[]`

Node `weight` measures how representative the node is of the document: leaves cover a
fraction of the document's words, concepts sum their children, and the root sums every
unique leaf (the share of the document covered by all extracted keywords).

**Edges** (`category: contains`): only root→concept edges are written, one per concept.
Each carries a `weight`: the concept's semantic similarity to the root topics +
description (Taggly `score`, 0–1). Concept→leaf membership is expressed by the concepts'
`children` lists rather than edges — a keyword relevant to several concepts appears in
each of their `children`. Keyword candidates that rank into no concept's children are
dropped from the graph.


## Viewer

```bash
graphly view graph.json [--port 3000] [--show-edges]
```

Serves a single-page Sigma.js explorer (no build step; libraries load from CDN as ES
modules). Node size reflects the node level (root largest, leaves smallest). Edges are
hidden by default; pass `--show-edges` (or set `show_edges: true`) to display them.

Layout: a cloud layout places the root at the center and packs concepts around it on a
golden-angle spiral, spaced by the typical cluster size (each cluster's radius grows with
its leaf count). Each leaf fills its parent's cluster disc on a golden-angle spiral, so
clusters sit shoulder-to-shoulder as one compact cloud for any concept count. A leaf
listed by several concepts clusters with the concept that ranks it highest.

Coloring and size: each concept is assigned a unique color from the configured
`colormaps` — schemes from [d3-scale-chromatic](https://d3js.org/d3-scale-chromatic):
sequential interpolators (`YlOrBr`, `Oranges`, `BuGn`, `Greys`, …) are sampled evenly
across the concept count; categorical schemes (`Tableau10`, `Set2`, `Dark2`, …) are used
as-is. Every leaf takes its parent concept's exact color, so each cluster reads as one
solid hue. Node size scales with the node's coverage `weight` — the root is largest and
rarely occurring keywords are smallest. The side panel lists every concept with its color
swatch.
