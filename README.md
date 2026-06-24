# graphly
A document knowledge graph generator built with Graphology and Sigma.js

Graphly is a config-driven TypeScript CLI used to extract document knowledge graph data using the
[Taggly](https://github.com/kotulc/taggly) utility. This tool takes a single text document as
input and outputs a JSON file with the serialized document knowledge graph based on the
[Graphology serialization schema](https://graphology.github.io/serialization.html).

This app uses the minimal amount of custom code and instead leverages standard packages and the
Taggly API for the bulk of complex functionality.



## Installation

Requires Node.js 18+ and a working [Taggly](https://github.com/kotulc/taggly) installation
(`pip install -e .` from the taggly repo, with `taggly` on `PATH`).

```bash
git clone https://github.com/kotulc/graphly
cd graphly
npm install
npm run build
npm link          # registers 'graphly' as a global command
```

`npm link` only needs to run once. After that, `npm run build` is enough to pick up source changes.


## First Use

```bash
# Generate a graph (graphly spawns Taggly automatically on first run)
graphly document.md

# Generate with custom limits and a named output
graphly document.md --max-tags 8 --max-keys 30 --output doc-graph.json

# Explore the result in the browser at http://127.0.0.1:3000
graphly view doc-graph.json
```

The first run is slow while Taggly loads its models. To reuse a running Taggly server across
runs (much faster), start it separately and graphly will find it:

```bash
# In a separate terminal
MODE=api WARMUP='["tags","keys"]' taggly

# Then generate graphs without the startup delay
graphly document.md
```

## Graph Structure

The document knowledge graph is built top-down and exported in node order: doc → tags → leaves.

- A **doc (root) node** computed from the document description and topics
- **Tag nodes** (up to `max_tags`) representing extracted entities, keywords, and concepts
- **Leaf nodes** (up to `max_keys` total, `max_leaves` per tag) representing keyword n-grams

Each node carries a `children` attribute listing the keys of its direct children.

**Doc node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Document filename |
| `type` | `"doc"` |
| `label` | Most relevant topic (`topics[0]`) |
| `description` | Generated document description |
| `topics` | Ranked topic list |
| `children` | List of tag node keys |

**Tag node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Tag label (entity, keyword, or concept) |
| `type` | Tag type: `entity`, `keyword`, or other concept category |
| `children` | List of leaf node keys (up to `max_leaves`) |

**Leaf node attributes:**

| Attribute | Description |
|-----------|-------------|
| `key` | Keyword or n-gram phrase |
| `type` | `"keyword"` |
| `forms` | Unique surface form variants found in the document text |
| `children` | `[]` (always empty) |


## Pipeline

Steps to export the document graph to JSON:
1. **tags** — extract up to `max_tags` typed tags (entities, keywords, concepts) via Taggly
2. **desc** — generate a description attribute for the doc node via Taggly
3. **topics** — discover up to `max_topics` ranked topics using the description, tags, and
   document text; `topics[0]` becomes the doc node `label`
4. **keys + rank** — extract keyword candidates via Taggly `keys`, then rank by relevance to
   the combined topics and description to select up to `max_keys` leaf nodes
5. **Per-tag rank** — for each tag, rank the leaf nodes by relevance to the tag and assign
   the top `max_leaves` as the tag's children


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
| `--max-tags <n>` | `max_tags` | `10` | Maximum number of tag nodes |
| `--max-keys <n>` | `max_keys` | `20` | Maximum number of leaf keyword nodes |
| `--max-topics <n>` | `max_topics` | `5` | Maximum number of document topics |
| `--max-leaves <n>` | `max_leaves` | `5` | Maximum leaf nodes per tag |
| `--taggly-url <url>` | `taggly_url` | `http://127.0.0.1:8000` | Running Taggly API instance |


## Viewer

The `graphly view` command launches a minimal graph explorer for a single document graph file.
Features:
- Toggle edges on/off
- Color nodes by tag type (each unique type gets a distinct palette color)
- Categories panel lists all node types with color swatches

The viewer is based on the [sigma.js demo](https://github.com/jacomyal/sigma.js/tree/main/packages/demo).

| Flag | Config key | Default | Description |
|------|------------|---------|-------------|
| `--port <n>` | `port` | `3000` | Viewer server port |
| `--color-by <mode>` | `color_by` | `type` | Color nodes by `type` or `weight` |
| `--hide-edges` | `show_edges` | `true` | Hide all edges |
