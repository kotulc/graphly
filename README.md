# graphly
A document knowledge graph generator built with Graphology and Sigma.js

Graphly is a config-driven TypeScript CLI used to extract document knowledge graph data using the
[Taggly](https://github.com/kotulc/taggly) API. This tool takes a single text document as
input and outputs a JSON file with the serialized document knowledge graph based on the
[Graphology serialization schema](https://graphology.github.io/serialization.html).

This app uses the minimal amount of custom code and instead leverages standard packages and the
Taggly API for the bulk of complex functionality.



## Installation

Requires Node.js 18+ and a running [Taggly](https://github.com/kotulc/taggly) API instance
(local or remote). Graphly never installs or manages Taggly — it simply connects to the host
and port you point it at.

```bash
git clone https://github.com/kotulc/graphly
cd graphly

npm install
npm run build
npm link          # registers 'graphly' as a global command
```

`npm link` only needs to run once. After that, `npm run build` is enough to pick up
source changes.

**Starting a Taggly instance:** install Taggly (`pip install -e <taggly-checkout>`) and run
`taggly start`, which serves the API at `http://127.0.0.1:8000`. Or run it anywhere with
Docker:

```bash
docker build -t taggly <taggly-checkout>
docker run --rm -p 8000:8000 \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  -e HF_TOKEN taggly
```


## First Use

```bash
# Start (or have running) a Taggly API instance, e.g. in a separate terminal
taggly start

# Generate a graph (uses the Taggly API at http://127.0.0.1:8000 by default)
graphly document.md

# Point graphly at a remote Taggly instance by host and port
graphly document.md --taggly-url http://192.168.1.20:8000

# Generate with custom limits and a named output
graphly document.md --max-concepts 8 --max-keys 30 --output doc-graph.json

# Explore the result in the browser at http://127.0.0.1:3000
graphly view doc-graph.json
```

The first request may be slow while Taggly lazily loads its models; see Taggly's `WARMUP`
setting to pre-load them at server startup.

## Graph Structure

The document knowledge graph is built top-down and exported in node order:
topic root → concepts → leaves.

- One **topic (root) node** computed from the document description and topics
- **Concept nodes** (up to `max_concepts`) representing extracted entities, keywords, and
  concepts
- **Leaf nodes** (up to `max_keys` total, `max_leaves` per concept) representing keyword
  n-grams extracted directly from the document

Each node carries a `children` attribute listing the keys of its direct children.

**Topic (root) node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Document filename |
| `category` | `"topic"` |
| `label` | Most relevant topic (`topics[0]`) |
| `description` | Generated document description |
| `topics` | Ranked topic list |
| `children` | List of concept node keys |

**Concept node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Concept label (entity, keyword, or other concept) |
| `category` | `"concept"` |
| `children` | List of leaf node keys (up to `max_leaves`) |

**Leaf node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Keyword or n-gram phrase |
| `category` | `"keyword"` |
| `forms` | Unique surface form variants found in the document text |
| `children` | `[]` (always empty) |

**Edges** — every edge is a directed hierarchy edge with `category: "contains"`, mirroring
the `children` attribute of its source node:

| Edge | Meaning |
|------|---------|
| root → concept | The document topic contains each concept (one edge per concept node) |
| concept → leaf | The concept's top `max_leaves` most relevant keywords (one edge per child) |

Leaves are shared: a keyword relevant to several concepts receives one incoming edge from
each, so graphs typically have more edges than nodes. Keyword candidates that do not rank
into any concept's children are dropped, so the leaf count can be below `max_keys`.


## Pipeline

Steps to export the document graph to JSON:
1. **tags** — extract typed tag groups (concepts, entities, keywords, topics, plus a combined
   relevance-sorted list) via Taggly `tags`
2. **desc** — generate a description attribute for the root node via Taggly `desc`
3. **topics** — rank the extracted topic group against the description via Taggly `rank`;
   `topics[0]` becomes the root node `label`
4. **concepts** — select up to `max_concepts` concept nodes from the combined relevance
   order, excluding the root topics
5. **keys + rank** — extract keyword candidates via Taggly `keys`, then rank by relevance to
   the combined topics and description to select up to `max_keys` leaf nodes
6. **Per-concept rank** — for each concept, rank the leaf nodes by relevance to the concept
   and assign the top `max_leaves` as the concept's children


## CLI Usage

```
graphly <input> [options]
graphly view <graph-file> [options]
```

All configuration can be provided via a YAML config file (`--config`) or as CLI flags. Flags take
precedence over config file values.

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--config <path>` | — | — | Path to YAML config file |
| `--output <path>` | `output` | `graph.json` | Output file path |
| `--max-concepts <n>` | `max_concepts` | `10` | Maximum number of concept nodes |
| `--max-keys <n>` | `max_keys` | `20` | Maximum number of leaf keyword nodes |
| `--max-topics <n>` | `max_topics` | `5` | Maximum number of document topics |
| `--max-leaves <n>` | `max_leaves` | `5` | Maximum leaf nodes per concept |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance (`http://<host>:<port>`) |


## Viewer

The `graphly view` command launches a minimal graph explorer for a single document graph file.
Features:
- Toggle edges on/off
- Color nodes by category (each unique category gets a distinct palette color)
- Categories panel lists all node categories with color swatches

The viewer is based on the [sigma.js demo](https://github.com/jacomyal/sigma.js/tree/main/packages/demo).

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--port <n>` | `port` | `3000` | Viewer server port |
| `--color-by <mode>` | `color_by` | `category` | Color nodes by `category` or `weight` |
| `--hide-edges` | `show_edges` | `true` | Hide all edges |
