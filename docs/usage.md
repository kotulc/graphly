# graphly Usage Guide

graphly turns a single text document into a knowledge graph JSON file using
[Taggly](https://github.com/kotulc/taggly) for tag extraction and
[Graphology](https://graphology.github.io/) for the graph structure, with a minimal
[Sigma.js](https://www.sigmajs.org/) viewer for exploring the result.


## Requirements

- Node.js 18+ (built-in `fetch` is required; developed on Node 22)
- A [Taggly](https://github.com/kotulc/taggly) installation for tag extraction:
  `pip install -e .` from the taggly repo, with `taggly` available on `PATH`

graphly talks to Taggly over its HTTP API. If no server is running at `taggly_url`,
graphly spawns `taggly` itself (with `MODE=api` and keys/ents warmup) and shuts it
down when done. To reuse a long-lived server instead — much faster across runs —
start one yourself and graphly will find it:

```powershell
$env:MODE = "api"
$env:WARMUP = '["keys", "ents"]'
taggly
```


## Installation

```bash
npm install
npm run build      # compiles to dist/; `npm run graphly -- <args>` runs from source
```


## Quickstart

```bash
# Generate a graph from any non-binary text document (.md, .txt, .py, ...)
graphly document.md

# Generate with options
graphly document.md --max-clusters 6 --similarity 0.4 --output doc-graph.json

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
| `--max-clusters <n>` | `max_clusters` | `12` | Maximum number of cluster nodes |
| `--max-leaves <n>` | `max_leaves` | `24` | Maximum leaf nodes per cluster |
| `--max-refs <n>` | `max_refs` | `36` | Maximum n-gram references per leaf |
| `--ngrams <sizes>` | `ngrams` | `1,2,3` | N-gram sizes used for anchoring |
| `--tag-types <types>` | `tag_types` | `keyword,entity` | Tag types to extract, in order |
| `--similarity <t>` | `similarity` | off | Add `related` edges between leaves with similarity ≥ t (0–1) |
| `--extract-relations` | `extract_relations` | `false` | Add typed relation edges between leaves |
| `--normalize` | `normalize` | `false` | Normalize leaf weights to sum to 1 |
| `--cluster-colors <map>` | `cluster_colors` | `{}` | JSON map of cluster label to color (viewer) |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Already running Taggly API instance |

Example `config.yaml`:

```yaml
output: doc-graph.json
max_clusters: 6
similarity: 0.4
tag_types: [entity, keyword]
taggly_url: http://127.0.0.1:8000
cluster_colors:
  machine learning: "#4363d8"
```

### Tag types

`keyword` and `entity` map to real Taggly commands (`keys`, `ents`). Any other type
(e.g. `topic`, `concept`) currently uses a deterministic frequency-based placeholder
until Taggly's `ext` command is available. When a tag is extracted under multiple
types, the first type listed in `tag_types` wins.

### Weights

Each leaf's `weight` is its `count` (total occurrences of its referencing n-grams)
divided by the total n-gram occurrences in the document. Weights are therefore
*partial* by default — the root's weight reads as "the fraction of the document this
graph represents". With `normalize: true` the denominator is the leaves' summed
counts instead, so leaf weights sum to 1 and the root weight is 1.


## Output

The output JSON follows the
[Graphology serialization schema](https://graphology.github.io/serialization.html)
and can be loaded with `Graph.from(data)`. Structure:

- One **root** node (`type: root`) labeled from the cluster labels
- Up to `max_clusters` **cluster** nodes (`type: cluster`) labeled from their leaves
- Up to `max_leaves` **leaf** nodes per cluster, typed by tag type, each carrying
  `refs` (top n-gram references), `count`, and `weight`
- `contains` edges (root→cluster, cluster→leaf) are always written; `related`
  (similarity) and `co_occurs` (relation) edges appear only when enabled

Cluster and root nodes aggregate `count` and `weight` from their children and carry
no `refs`. Graphology node ids for cluster/root nodes are prefixed with `#`
(`#root`, `#cluster_0`); the human-readable label is always in the `key` attribute.


## Viewer

```bash
graphly view graph.json [--port 3000] [--color-by cluster|weight]
                        [--hide-edges] [--cluster-colors '{"label": "#ff0000"}']
```

Serves a single-page Sigma.js explorer (no build step; libraries load from CDN, so
the browser needs network access). Node size scales with weight. Options are
config-driven for now:

- `color_by: cluster` (default) colors leaves by their cluster; `weight` shades
  leaves light-to-dark by weight
- `cluster_colors` pins specific cluster labels to fixed colors
- `show_edges: false` (or `--hide-edges`) hides all edges

The side panel lists the extracted tag types (categories) and all cluster nodes.


## Placeholder functionality

Taggly's `score`, `rel`, and `ext` commands are planned but not yet implemented.
graphly substitutes deterministic local placeholders behind the same client
interface (`src/taggly.ts`), so each swaps to a real HTTP call without pipeline
changes:

| Command | Used for | Placeholder behavior |
|---------|----------|----------------------|
| `score` | clustering, similarity edges | Jaccard token overlap |
| `rel` | leaf selection per cluster | MMR over counts with a diversity penalty |
| `ext` | extra tag types, relation edges | token frequency / shared-reference co-occurrence |

Cluster and root labels use real Taggly `keys` calls over the children's labels.
Expect label and clustering quality to improve substantially once Taggly's semantic
`score` and LLM-based `ext` land; the graph structure and schema will not change.
