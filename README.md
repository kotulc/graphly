# graphly
A treemap page-index component and Taggly-backed document graph generator

Graphly has two related pieces:

1. **An embeddable treemap component** — a compact heatmap strip that visualizes a nested
   tree data file as a visual navigation index for a web page. Tile size and color are
   driven by named per-node values, colors follow the site theme, hovering a cell shows its
   metadata, and clicking a cell navigates to the page section it links. The component is
   fully static: it consumes one JSON file and needs no server.
2. **A generator CLI** — a convenient local way to produce that data file from a single
   text document using the [Taggly](https://github.com/kotulc/taggly) API (topics, concept
   and keyword extraction, relevance scoring). Hand-authored data files are equally valid;
   the component is schema-driven, not pipeline-driven.

This app uses the minimal amount of custom code and instead leverages standard packages
(d3-hierarchy for the treemap layout) and the Taggly API for the bulk of complex
functionality.


## Data Schema

The contract between any producer and the component is one JSON file:

```json
{ "version": 1, "title": "Systems Design Notes",
  "values": ["relevance", "coverage", "count"],
  "root": {
    "name": "Systems Design Notes",
    "values": { "relevance": 1, "coverage": 0.31, "count": 24 },
    "meta": { "description": "..." },
    "children": [
      { "name": "Architecture", "href": "#architecture",
        "values": { "relevance": 0.72, "coverage": 0.18, "count": 14 },
        "meta": { "category": "concepts" },
        "children": [
          { "name": "event bus", "href": "#architecture",
            "values": { "relevance": 0.61, "coverage": 0.08, "count": 6 },
            "meta": { "forms": "event bus, Event Bus" } } ] } ] } }
```

- `name` is the only required node field; `href`, `values`, `meta`, and `children` are
  optional at every level and nesting depth is arbitrary.
- `values` holds arbitrary named numbers per node; the top-level `values` list declares
  the selector order. A value missing from a node counts as 0.
- `meta` holds string/number pairs rendered verbatim in the hover tooltip.
- `href` (an anchor like `#section` or any URL) makes the cell a link.

The generator emits three standard values — `relevance` (semantic similarity to the
document topics + description via Taggly `score`), `coverage` (fraction of document words
covered: `count × phrase words / document words`), and `count` (whole-word occurrences).
Concept nodes sum their children's `count`/`coverage`; the root sums every unique keyword,
so it always carries the greatest coverage.


## Component

[component/](component/) ships three flat browser files, importable in any React/MDX site:

- `Graphly.jsx` — React wrapper: fetches the data file, renders the value-selector chips,
  and re-renders on theme changes and container resizes
- `treemap.js` — framework-free squarified treemap renderer (shared by the viewer)
- `d3_hierarchy.js` — committed ESM bundle of the d3-hierarchy pieces (`npm run bundle`)

Tiles are colored `hsl(var(--site-hs) L%)` with lightness interpolated over the color
value — pale→strong in light themes, flipped in dark themes — so the heatmap matches any
site that defines the `--site-hs` hue/saturation token (as mdsite does).

### Embedding in an mdsite page

Point `mdsite.yaml` at the component and data file, then import it from any content page
([examples/site](examples/site) is a complete working example):

```yaml
components: <path-to-graphly>/component   # mirrored into components/custom/
assets: ./assets                          # graph.json here → public/assets/
```

```mdx
import Graphly from '../components/custom/Graphly'

<Graphly src="assets/graph.json" size="coverage" color="relevance" height={160} />
```

Props: `src` (data file under the site base path), `size` / `color` (value names),
`height` (px), `selector` (show the value chips), `on_click(node)` (override href
navigation, e.g. for custom filtering).


## Installation

Requires Node.js 18+. The generator additionally needs a running
[Taggly](https://github.com/kotulc/taggly) API instance (local or remote) — graphly never
installs or manages Taggly, it simply connects to the host and port you point it at.

```bash
git clone https://github.com/kotulc/graphly
cd graphly

npm install
npm run build
npm link          # registers 'graphly' as a global command
```

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

# Generate a tree data file (settings come from ./config.yaml; edit it to change
# limits, the output path, or the Taggly instance's host and port)
graphly document.md

# Use a different config file
graphly document.md --config myconfig.yaml

# Preview the result in the browser at http://127.0.0.1:3000
graphly view graph.json
```

The first request may be slow while Taggly lazily loads its models; see Taggly's `WARMUP`
setting to pre-load them at server startup.


## Pipeline

Steps to generate the tree data file:
1. **tags** — extract tag groups for the configured `concepts` categories (plus `topics`
   for the root and a combined relevance-sorted list) via Taggly `tags`
2. **desc** — generate the root description via Taggly `desc`
3. **topics** — rank the extracted topic group against the description via Taggly `rank`;
   `topics[0]` names the root node
4. **concepts** — select up to `max_concepts` concept nodes from the combined relevance
   order; only tags in a configured category qualify (root topics and keywords excluded).
   Each concept's `relevance` is its similarity to the topics + description (Taggly `score`)
5. **keys + rank** — extract keyword candidates via Taggly `keys`, then rank by relevance
   to the combined topics and description to select up to `max_keys` keywords
6. **Per-concept rank** — for each concept, rank the keywords via Taggly `rank` and assign
   the top `max_leaves` as the concept's children (a keyword relevant to several concepts
   appears under each; keywords ranking into no concept are dropped)
7. **Values** — score each assigned keyword's `relevance` (Taggly `score`) and compute
   `count` and `coverage` locally from whole-word document occurrences, aggregating
   keyword → concept → root


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
| `port` | `3000` | Viewer server port |


## Viewer

`graphly view graph.json` serves a single-page sample harness rendering the data file with
the exact treemap module the mdsite component uses. Selects switch the size and color
values, and a theme button flips the heatmap ramp between light and dark — a quick way to
eyeball any generated or hand-authored data file before embedding it.
