# graphly Usage Guide

graphly renders a nested tree data file as a compact heatmap treemap — an embeddable
page-index component for [mdsite](https://github.com/kotulc/mdsite) (or any React/MDX
site) — and generates that data file from a single text document using
[Taggly](https://github.com/kotulc/taggly) for extraction and relevance scoring.


## Requirements

- Node.js 18+ (built-in `fetch` is required; developed on Node 22)
- For the generator only: a running [Taggly](https://github.com/kotulc/taggly) API
  instance, local or remote

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
# Generate a tree data file from any non-binary text document (.md, .txt, .py, ...);
# settings come from ./config.yaml
graphly document.md

# Use a different config file
graphly document.md --config myconfig.yaml

# Preview the result at http://127.0.0.1:3000
graphly view graph.json
```


## Configuration

All settings live in the YAML config file — `--config <path>` is the only CLI flag.
The repo root `config.yaml` lists every setting with its default value; graphly loads a
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

The `concepts` categories are passed straight to Taggly's `tags` command, so any category
its `ext` extraction understands can be used (e.g. `[people, organizations]`); each
concept node's `meta.category` records the category it was extracted as.


## Data File Schema

The output JSON is the generic contract the component consumes — any producer
(the generator, another tool, or a hand-written file) can create it:

```json
{ "version": 1, "title": "<root name>",
  "values": ["relevance", "coverage", "count"],
  "root": { "name": "...", "href": "#...", "values": {}, "meta": {}, "children": [] } }
```

Per node:

| Field | Description |
|-------|-------------|
| `name` | Display label (required; the only required field) |
| `href` | Optional link target — an anchor (`#section`) or URL; makes the cell a link |
| `values` | Arbitrary named numbers driving tile size and color (missing → 0) |
| `meta` | String/number pairs shown verbatim in the hover tooltip |
| `children` | Nested child nodes (any depth) |

The top-level `values` list declares the value names in selector order.

**Generator output** — a three-level tree (root → concepts → keywords) with values:

- `relevance`: semantic similarity to the document topics + description (Taggly `score`,
  0–1; the root is always 1)
- `coverage`: fraction of document words covered — `count × phrase words / document
  words`; concepts sum their children, the root sums every unique keyword (always the
  greatest coverage in the tree)
- `count`: whole-word occurrences in the document, aggregated the same way

The root's `meta` carries the generated `description` and ranked `topics`; concepts carry
their tag `category`; keywords carry their surface `forms`. A keyword relevant to several
concepts appears under each of them; keywords ranking into no concept's children are
dropped, so the keyword count can be below `max_keys`. The generator writes no `href`
values — add them where cells should navigate (anchors are page-specific).


## Embedding

See [examples/site](../examples/site) for a complete mdsite example. In `mdsite.yaml`:

```yaml
components: <path-to-graphly>/component   # mirrored into components/custom/ each build
assets: ./assets                          # data files, mirrored to public/assets/
```

Then in any content page:

```mdx
import Graphly from '../components/custom/Graphly'

<Graphly src="assets/graph.json" size="coverage" color="relevance" height={160} />
```

| Prop | Default | Description |
|------|---------|-------------|
| `src` | `graph.json` | Data file path under the site base path |
| `size` | `coverage` | Value name driving tile area (summed over leaf tiles) |
| `color` | `relevance` | Value name driving heatmap color intensity |
| `height` | `180` | Strip height in px |
| `selector` | `true` | Show chips to switch the color value |
| `on_click` | — | `on_click(node)` override; replaces href navigation |

Colors are `hsl(var(--site-hs) L%)` with lightness interpolated over the color value,
normalized to the greatest leaf value — 94%→39% in light themes and 25%→70% in dark
(read from `next-themes`), so tiles track mdsite's configured hue automatically. Build
`component/d3_hierarchy.js` with `npm run bundle` after upgrading d3-hierarchy; the bundle
is committed so consumers never need a build step.


## Viewer

```bash
graphly view graph.json [--config <path>]
```

Serves a single-page sample harness (no build step, no CDN) that renders the data file
with the same `component/treemap.js` the mdsite component uses. Size and color selects
re-render the strip, the theme button flips the light/dark heatmap ramp, and cells with
an `href` act as links — hover any cell to see its values and meta.
