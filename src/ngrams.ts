/**
 * Surface form and coverage statistics: whole-word matches of keywords in a document.
 */


/** All whole-word matches of keyword in doc_text (case-insensitive). */
function find_matches(keyword: string, doc_text: string): string[] {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![\\w'-])${escaped}(?![\\w'-])`, 'gi');
  return doc_text.match(regex) ?? [];
}


/** Total whole-word occurrences of keyword in doc_text. */
export function count_matches(keyword: string, doc_text: string): number {
  return find_matches(keyword, doc_text).length;
}


/** Count whitespace-delimited words in text. */
export function count_words(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}


/** Find unique surface form variants of keyword in doc_text (case-insensitive, whole-word). */
export function find_forms(keyword: string, doc_text: string): string[] {
  return [...new Set(find_matches(keyword, doc_text))];
}
