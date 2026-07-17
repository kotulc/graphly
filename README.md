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

# Generate a graph (settings come from ./config.yaml; edit it to change limits,
# the output path, or the Taggly instance's host and port)
graphly document.md

# Use a different config file
graphly document.md --config myconfig.yaml

# Explore the result in the browser at http://127.0.0.1:3000
graphly view graph.json
```

The first request may be slow while Taggly lazily loads its models; see Taggly's `WARMUP`
setting to pre-load them at server startup.

## Graph Structure

The document knowledge graph is built top-down and exported in node order:
topic root → concepts → leaves.

- One **topic (root) node** computed from the document description and topics
- **Concept nodes** (up to `max_concepts`) — tags extracted by Taggly for the configured
  `concepts` categories; each node's `category` is the tag category it was extracted as
- **Leaf nodes** (up to `max_keys` total, `max_leaves` per concept) representing keyword
  n-grams extracted directly from the document; the `keyword` category is reserved for leaves

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
| `weight` | Fraction of document words covered by all leaf keywords — always the greatest weight in the graph |

**Concept node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Concept label |
| `category` | Tag category the concept was extracted as (one of the configured `concepts`, e.g. `entities`) |
| `children` | List of leaf node keys (up to `max_leaves`) |
| `weight` | Sum of its children's coverage weights |

**Leaf node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Keyword or n-gram phrase |
| `category` | `"keyword"` |
| `forms` | Unique surface form variants found in the document text |
| `count` | Total whole-word occurrences of the keyword in the document |
| `weight` | Document coverage: `count × words in phrase / total document words` |
| `children` | `[]` (always empty) |

**Weights** measure how representative a node is of the document: a leaf's weight is the
fraction of document words its occurrences cover, a concept's weight sums its children,
and the root's weight sums every unique leaf — so the root always carries the greatest
weight, the share of the document its keywords cover.

**Edges** — only root→concept edges are written (`category: "contains"`, one per concept
node). Each carries a `weight`: the concept's semantic similarity to the root topics +
description (Taggly `score`, 0–1). Concept→leaf membership is expressed by the concepts'
`children` lists rather than edges; a keyword relevant to several concepts appears in each
of their `children`. Keyword candidates that do not rank into any concept's children are
dropped, so the leaf count can be below `max_keys`.


## Pipeline

Steps to export the document graph to JSON:
1. **tags** — extract tag groups for the configured `concepts` categories (plus `topics` for
   the root and a combined relevance-sorted list) via Taggly `tags`
2. **desc** — generate a description attribute for the root node via Taggly `desc`
3. **topics** — rank the extracted topic group against the description via Taggly `rank`;
   `topics[0]` becomes the root node `label`
4. **concepts** — select up to `max_concepts` concept nodes from the combined relevance
   order; only tags in a configured category qualify (root topics and keywords excluded)
5. **keys + rank** — extract keyword candidates via Taggly `keys`, then rank by relevance to
   the combined topics and description to select up to `max_keys` leaf nodes
6. **Per-concept rank** — for each concept, rank the leaf nodes by relevance via Taggly
   `rank` and assign the top `max_leaves` as the concept's children
7. **Coverage weights** — count each leaf's whole-word occurrences in the document and
   derive coverage weights (leaf → concept sum → root total) computed locally in graphly


## CLI Usage

```
graphly <input> [--config <path>]
graphly view <graph-file> [--config <path>]
```

All configuration lives in the YAML config file — `--config <path>` is the only CLI flag.
The repo ships a [config.yaml](config.yaml) listing every setting; graphly loads
`config.yaml` from the working directory when no `--config` path is given, and schema
defaults fill any missing keys.

| Config key | Default | Description |
|------------|---------|-------------|
| `output` | `graph.json` | Output file path |
| `concepts` | `[concepts, entities]` | Tag categories extracted as concept nodes (`topics` is always added for the root; `keywords` is reserved for leaves) |
| `max_concepts` | `16` | Maximum number of concept nodes |
| `max_keys` | `128` | Maximum number of leaf keyword nodes |
| `max_topics` | `8` | Maximum number of document topics |
| `max_leaves` | `32` | Maximum leaf nodes per concept |
| `max_ngram` | `1` | Maximum words per keyword phrase (passed to Taggly `keys`) |
| `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance (`http://<host>:<port>`) |


## Viewer

The `graphly view` command launches a minimal graph explorer for a single document graph file.
Features:
- Petal layout: concepts cluster tightly around the root on a small ring, and each
  concept's leaves fan outward within the concept's angular wedge — clusters stay grouped
  behind their parent for any concept count
- Each concept gets a unique color from the configured `colormaps`, and every leaf takes
  its parent's exact color, so each cluster reads as one solid hue
- Node size reflects the node's coverage `weight` (root largest, minor keywords smallest),
  and leaf labels render even at small sizes when zoomed out
- Edges are hidden by default (`show_edges: true` displays the root→concept edges)
- The side panel lists every concept with its color swatch

Colormaps are schemes from [d3-scale-chromatic](https://d3js.org/d3-scale-chromatic), by
name with the `interpolate`/`scheme` prefix optional. Interpolators — sequential
(`YlOrBr`, `Plasma`, `Viridis`, `Turbo`, …) or cyclical (`Rainbow`, `Sinebow`) — are
sampled evenly across the concept count (sequential ramps are auto-trimmed of ends too
pale to see), while categorical schemes (`Tableau10`, `Set2`, `Dark2`, …) are used as-is.
Listing several schemes splits the concepts between them.

The viewer is based on the [sigma.js demo](https://github.com/jacomyal/sigma.js/tree/main/packages/demo).

| Config key | Default | Description |
|------------|---------|-------------|
| `port` | `3000` | Viewer server port |
| `show_edges` | `false` | Show the root→concept edges (hidden by default) |
| `colormaps` | `[YlOrBr]` | d3-scale-chromatic schemes for concept colors |
