/**
 * Surface form extraction: finds unique textual variants of a keyword in a document.
 */


/** Find unique surface form variants of keyword in docText (case-insensitive, whole-word). */
export function find_forms(keyword: string, docText: string): string[] {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![\\w'-])${escaped}(?![\\w'-])`, 'gi');
  const forms = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(docText)) !== null) forms.add(match[0]);
  return [...forms];
}
