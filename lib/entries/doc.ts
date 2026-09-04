/**
 * Pure helpers over the Tiptap document JSON. No database, no React — these are
 * the functions the unit tests in tests/unit/doc.test.ts pin down.
 */

export type ProseNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: ProseNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export const EMPTY_DOC: ProseNode = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Node types that should read as a line break when flattening to plain text. */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
]);

/**
 * Plain-text projection of a document, used for FTS indexing and card previews.
 * Entry links contribute their visible label so searching for a linked name works.
 */
export function docToText(doc: unknown): string {
  const out: string[] = [];

  const walk = (node: ProseNode | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'text' && typeof node.text === 'string') {
      out.push(node.text);
      return;
    }
    if (node.type === 'entryLink') {
      const label = node.attrs?.label;
      if (typeof label === 'string') out.push(label);
      return;
    }
    if (node.type === 'image') {
      const alt = node.attrs?.alt;
      if (typeof alt === 'string' && alt) out.push(alt);
      return;
    }
    if (Array.isArray(node.content)) for (const child of node.content) walk(child);
    if (node.type && BLOCK_TYPES.has(node.type)) out.push('\n');
  };

  walk(doc as ProseNode);
  return out
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Every entry id referenced by an entryLink node, in document order, deduped.
 * This is what `entry_links` is recomputed from on each save.
 */
export function extractEntryLinks(doc: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const walk = (node: ProseNode | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'entryLink') {
      const id = node.attrs?.id;
      if (typeof id === 'string' && id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
      return;
    }
    if (Array.isArray(node.content)) for (const child of node.content) walk(child);
  };

  walk(doc as ProseNode);
  return ids;
}

/** True when a document holds nothing a reader would see. */
export function isEmptyDoc(doc: unknown): boolean {
  return docToText(doc).length === 0;
}

/** First ~n characters of the body, for previews where there is no short description. */
export function docExcerpt(doc: unknown, max = 180): string {
  const text = docToText(doc);
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}
