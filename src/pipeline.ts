/**
 * Document graph pipeline: orchestrates Taggly commands (tags, desc, keys,
 * rank) into a serialized Graphology graph (README pipeline steps 1-5).
 */

import { basename } from 'node:path';
import { SerializedGraph } from 'graphology-types';

import { Config } from './config.js';
import { build_graph } from './graph.js';
import { find_forms } from './ngrams.js';
import { TagglyClient } from './taggly.js';


/** Run the full pipeline on a document and return the serialized graph. */
export async function generate_graph(
    text: string, input_path: string, config: Config, client: TagglyClient
): Promise<SerializedGraph> {
  // 1. Extract typed tag groups (concepts, entities, keywords, topics, scored/ranked)
  const groups = await client.tags(text, config.max_concepts + config.max_topics);

  // 2. Generate a document description
  const description = await client.desc(text);

  // 3. Rank the extracted topic group by relevance to the description; root label = topics[0]
  const topic_pool = groups['topics'] ?? [];
  const topics = topic_pool.length
    ? await client.rank(description, topic_pool, config.max_topics) : [];

  // 4. Select concept nodes from the combined relevance order, excluding root topics
  const ordered = groups['ranked'] ?? groups['scored']
    ?? [...new Set(Object.values(groups).flat())];
  const topic_set = new Set(topic_pool);
  const concepts = ordered.filter(key => !topic_set.has(key)).slice(0, config.max_concepts);

  // 5. Extract keyword candidates and rank by relevance to topics + description
  const candidates = await client.keys(text, config.max_keys * 2);
  const query = topics.join(' ') + ' ' + description;
  const leaves = await client.rank(query, candidates, config.max_keys);

  // 6. For each concept, rank leaves by relevance to the concept and assign as children
  const leaves_by_concept = new Map<string, string[]>();
  for (const concept of concepts)
    leaves_by_concept.set(concept, await client.rank(concept, leaves, config.max_leaves));

  const forms_by_leaf = new Map(
    [...new Set(leaves)].map(leaf => [leaf, find_forms(leaf, text)])
  );

  return build_graph(
    basename(input_path), description, topics, concepts, leaves_by_concept, forms_by_leaf
  ).export();
}
