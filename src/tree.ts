/**
 * Tree data contract and assembly: the generic nested-tree schema consumed by
 * the treemap component (name, optional href, named values, hover meta,
 * children), plus build_tree which assembles pipeline extraction results
 * (root, concepts, leaves) into that schema with aggregated values.
 */

import { readFileSync } from 'node:fs';
import { z } from 'zod';


/** A concept node: its tag string, the tag category it was extracted as, and
 *  its similarity to the root query (stored as the concept 'relevance' value). */
export interface Concept { key: string; category: string; similarity: number }

/** Leaf document statistics: surface forms, occurrence count, coverage
 *  (fraction of document words covered), and relevance to the root query. */
export interface LeafInfo { forms: string[]; count: number; coverage: number; relevance: number }


// Recursive node schema: only 'name' is required; values/meta default empty
const node_schema = z.object({
  name: z.string().min(1),
  href: z.string().optional(),
  values: z.record(z.string(), z.number()).default({}),
  meta: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  get children() { return z.array(node_schema).optional(); },
});

export const tree_schema = z.object({
  version: z.literal(1),
  title: z.string(),
  values: z.array(z.string()),
  root: node_schema,
});

export type TreeNode = z.infer<typeof node_schema>;
export type TreeFile = z.infer<typeof tree_schema>;


/** Read and validate a tree data file (JSON in the schema above). */
export function load_tree(path: string): TreeFile {
  return tree_schema.parse(JSON.parse(readFileSync(path, 'utf8')));
}


/**
 * Assemble the extraction results into a tree file. Root name is the top
 * topic (falling back to doc_key); concept count/coverage sum their children,
 * root count/coverage sum every unique leaf (shared leaves counted once);
 * relevance is the node's own similarity to the root query (1 for the root).
 */
export function build_tree(
  doc_key: string,
  description: string,
  topics: string[],
  concepts: Concept[],
  leaves_by_concept: Map<string, string[]>,
  leaf_info: Map<string, LeafInfo>,
): TreeFile {
  const info = (leaf: string): LeafInfo =>
    leaf_info.get(leaf) ?? { forms: [], count: 0, coverage: 0, relevance: 0 };

  const leaf_node = (leaf: string): TreeNode => {
    const { forms, count, coverage, relevance } = info(leaf);
    return { name: leaf, values: { relevance, coverage, count },
             meta: forms.length ? { forms: forms.join(', ') } : {} };
  };

  const concept_node = (concept: Concept): TreeNode => {
    const children = leaves_by_concept.get(concept.key) ?? [];
    const sum = (value: 'count' | 'coverage') =>
      children.reduce((total, leaf) => total + info(leaf)[value], 0);
    return { name: concept.key, meta: { category: concept.category },
             values: { relevance: concept.similarity, coverage: sum('coverage'),
                       count: sum('count') },
             children: children.map(leaf_node) };
  };

  // Root values cover every unique leaf so shared leaves are counted once
  const unique = [...new Set([...leaves_by_concept.values()].flat())];
  const total = (value: 'count' | 'coverage') =>
    unique.reduce((sum, leaf) => sum + info(leaf)[value], 0);

  const name = topics[0] ?? doc_key;
  return {
    version: 1, title: name, values: ['relevance', 'coverage', 'count'],
    root: { name, values: { relevance: 1, coverage: total('coverage'), count: total('count') },
            meta: { description, topics: topics.join(', ') },
            children: concepts.map(concept_node) },
  };
}
