/**
 * Document graph pipeline: orchestrates Taggly commands (tags, desc, topics,
 * keys, rank) into a serialized Graphology graph (README pipeline steps 1-5).
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
  // 1. Extract typed tags from the document
  const tags = await client.tags(text, config.max_tags);

  // 2. Generate a document description
  const description = await client.desc(text);

  // 3. Discover topics using description, tags, and document text; root label = topics[0]
  const tags_text = tags.map(t => t.key).join(', ');
  const topics = await client.topics([description, tags_text, text], config.max_topics);

  // 4. Extract keyword candidates and rank by relevance to topics + description
  const candidates = await client.keys(text, config.max_keys * 2);
  const query = topics.join(' ') + ' ' + description;
  const leaves = await client.rank(query, candidates, config.max_keys);

  // 5. For each tag, rank leaves by relevance to the tag and assign as children
  const leaves_by_tag = new Map<string, string[]>();
  for (const tag of tags)
    leaves_by_tag.set(tag.key, await client.rank(tag.key, leaves, config.max_leaves));

  const all_leaves = new Set(leaves);
  const forms_by_leaf = new Map(
    [...all_leaves].map(leaf => [leaf, find_forms(leaf, text)])
  );

  return build_graph(
    basename(input_path), description, topics, tags, leaves_by_tag, forms_by_leaf
  ).export();
}
