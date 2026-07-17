/**
 * Document graph pipeline: orchestrates Taggly commands (tags, desc, keys,
 * rank, score) into a serialized Graphology graph (README pipeline steps 1-7).
 */

import { basename } from 'node:path';
import { SerializedGraph } from 'graphology-types';

import { Config } from './config.js';
import { build_graph, Concept, LeafInfo } from './graph.js';
import { count_matches, count_words, find_forms } from './ngrams.js';
import { TagglyClient } from './taggly.js';


/** Run the full pipeline on a document and return the serialized graph. */
export async function generate_graph(
    text: string, input_path: string, config: Config, client: TagglyClient
): Promise<SerializedGraph> {
  // 1. Extract tag groups for the configured concept categories ('topics' added for
  //    the root; 'keywords' is reserved for leaves and never a concept category)
  const categories = config.concepts.filter(c => c !== 'keywords');
  const requested = [...new Set([...categories, 'topics'])].join(', ');
  const groups = await client.tags(text, config.max_concepts + config.max_topics, requested);

  // 2. Generate a document description
  const description = await client.desc(text);

  // 3. Rank the extracted topic group by relevance to the description; root label = topics[0]
  const topic_pool = groups['topics'] ?? [];
  const topics = topic_pool.length
    ? await client.rank(description, topic_pool, config.max_topics) : [];

  // 4. Select concept nodes from the combined relevance order: only tags belonging to a
  //    configured category qualify, root topics are excluded, first category wins. Each
  //    concept is scored against the root query (stored as the root→concept edge weight).
  const category_of = new Map<string, string>();
  for (const category of categories)
    for (const key of groups[category] ?? [])
      if (!category_of.has(key)) category_of.set(key, category);

  const ordered = groups['ranked'] ?? groups['scored'] ?? [...category_of.keys()];
  const topic_set = new Set(topic_pool);
  const selected = ordered
    .filter(key => category_of.has(key) && !topic_set.has(key))
    .slice(0, config.max_concepts);

  const query = topics.join(' ') + ' ' + description;
  const similarities = selected.length ? await client.score(query, selected) : [];
  const concepts: Concept[] = selected.map((key, i) =>
    ({ key, category: category_of.get(key)!, similarity: similarities[i] ?? 0 }));

  // 5. Extract keyword candidates and rank by relevance to topics + description
  const candidates = await client.keys(text, config.max_keys * 2, config.max_ngram);
  const leaves = await client.rank(query, candidates, config.max_keys);

  // 6. Per concept: rank leaves for relevance and assign the top max_leaves as children
  const leaves_by_concept = new Map<string, string[]>();
  for (const concept of concepts)
    leaves_by_concept.set(concept.key, await client.rank(concept.key, leaves, config.max_leaves));

  // 7. Leaf coverage stats: surface forms, occurrence count, and weight — the
  //    fraction of document words covered by the leaf's occurrences
  const total_words = count_words(text);
  const assigned = new Set([...leaves_by_concept.values()].flat());
  const leaf_info = new Map<string, LeafInfo>([...assigned].map(leaf => {
    const count = count_matches(leaf, text);
    const weight = total_words ? count * count_words(leaf) / total_words : 0;
    return [leaf, { forms: find_forms(leaf, text), count, weight }];
  }));

  return build_graph(
    basename(input_path), description, topics, concepts, leaves_by_concept, leaf_info
  ).export();
}
