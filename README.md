# graphly
A document knowledge graph generator built with Graphology and Sigma.js

Graphly is a config-driven TypeScript CLI used to extract document knowledge graph data using the
[Taggly](https://github.com/kotulc/taggly) utility. This tool takes a single text document as
input and outputs a JSON file with the serialized document knowledge graph based on the
[Graphology serialization schema](https://graphology.github.io/serialization.html).

This app uses the minimal amount of custom code and instead leverages standard packages and the
Taggly API for the bulk of complex functionality.


## Graph Structure

The document knowledge graph is built bottom-up and contains:
- A **root node** computed from the collected cluster and leaf nodes that categorizes the overall document
- **Cluster nodes** (up to `max_clusters`), each summarizing a set of leaf nodes
- **Leaf nodes** (up to `max_leaves` per cluster) representing extracted entities, keywords, topics, or other concepts

The maximum number of graph nodes is `1 + max_clusters * max_leaves`. If the document yields
fewer tags or clusters than the configured maximums, the graph contains fewer nodes with no error.

Nodes are defined with the following attributes:

| Attribute | Description |
|-----------|-------------|
| `key` | Entity/concept label extracted from the document |
| `type` | Tag type: entity, keyword, topic, or other pre-defined or user-supplied category |
| `refs` | List of the most relevant n-gram references for this node (up to `max_refs`) |
| `count` | Number of unique n-gram instances found in the document |
| `weight` | Percentage of total document n-grams represented by this node |

N-grams default to `[1, 2, 3]` (unigrams, bigrams, trigrams) but may be user-supplied.


## Pipeline

Steps to export the document graph to JSON:
1. Extract document tags by default or user-defined types (entity, keyword, topic, concept, relation, etc.) via Taggly
2. Anchor extracted tags to document n-grams (`refs`), count and store unique references per tag
3. Cluster extracted document tags (leaf nodes) up to `max_clusters` using semantic similarity
4. Select leaf nodes per cluster using MMR (relevance computed against the cluster centroid) up to `max_leaves`
5. Compute node weights as a percentage of total document n-grams
6. Compute the root node (document-level category/topic/concept) from the collected cluster nodes
7. Optionally compute similarity edges: if `similarity` is set, "related to" edges are added between nodes that meet or exceed the threshold
8. Optionally extract relationship edges: if `extract_relations` is enabled, LLM-derived typed relationship edges are added. Both edge types may be enabled simultaneously.


## CLI Usage

```
graphly <input> [options]
graphly view <graph-file> [options]
```

All configuration can be provided via a YAML config file (`--config`) or as CLI flags. Flags take
precedence over config file values.

| Flag | Config key | Description |
|------|------------|-------------|
| `--config <path>` | — | Path to YAML config file |
| `--output <path>` | `output` | Output file path (default: `graph.json`) |
| `--max-clusters <n>` | `max_clusters` | Maximum number of cluster nodes |
| `--max-leaves <n>` | `max_leaves` | Maximum leaf nodes per cluster |
| `--max-refs <n>` | `max_refs` | Maximum n-gram references per node |
| `--ngrams <sizes>` | `ngrams` | Comma-separated n-gram sizes (default: `1,2,3`) |
| `--tag-types <types>` | `tag_types` | Comma-separated tag types to extract (default: all) |
| `--similarity <threshold>` | `similarity` | Enables similarity edges at this 0–1 threshold |
| `--extract-relations` | `extract_relations` | Enables LLM-based relation edge extraction |
| `--cluster-colors <map>` | `cluster_colors` | JSON map of cluster label to fixed color value |


## Viewer

The `graphly view` command launches a minimal graph explorer for a single document graph file.
Features:
- Toggle edges on/off
- Color nodes by weight or by cluster
- Cluster colors can be mapped to fixed values via `--cluster-colors`
- Categories list maps to extracted tag types; clusters list displays all cluster nodes

The viewer is based on the [sigma.js demo](https://github.com/jacomyal/sigma.js/tree/main/packages/demo).


## Planned Taggly Features

The following Taggly capabilities are planned but not yet implemented. Once available they will
be used for the corresponding pipeline steps:

- **score**: semantic similarity measures (steps 4, 7)
- **rel**: MMR-based selection (step 4)
- **ext**: LLM-based tag type and relationship extraction (steps 1, 8)
