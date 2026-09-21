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

/* ---------------------------------------------------------------- §89 */

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const ASSET_PATH = /^\/api\/assets\/[A-Za-z0-9_-]{1,64}$/;
const ASSET_VARIANT = /^(|\?s=(thumb|card|full))$/;

/**
 * §89: may a link in a document point here? A web address, a mail address, or
 * a path inside the archive — never `javascript:`, `data:`, `vbscript:` or a
 * protocol-relative `//elsewhere`. The browser's editor refuses the worst of
 * these too (Tiptap's link guard), but a document is JSON a browser *sends*,
 * and the archive does not take a browser's word for what it contains.
 */
export function isSafeHref(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const href = value.trim();
  if (!href || href.length > 2048) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(href)) return false;
  if (href.startsWith('/')) return !href.startsWith('//');
  if (href.startsWith('#')) return true;
  try {
    const protocol = new URL(href).protocol;
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * §89: the one picture address a document may hold — an upload of this archive,
 * as the editor writes it (`/api/assets/{id}`, optionally `?s=thumb|card|full`).
 * An absolute address to the same path (a paste from another tab) is brought
 * back to the path; anything else answers null and the picture is dropped. An
 * outside address in an `<img>` is a beacon: every reader of the artikel would
 * announce themselves, with their address and the time, to whoever owns it.
 */
export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, 'http://archief.invalid');
  } catch {
    return null;
  }
  if (!ASSET_PATH.test(parsed.pathname) || !ASSET_VARIANT.test(parsed.search)) return null;
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * §89: a document, made safe to store and to hand to every other reader.
 *
 * Called on every road a rich text takes into the database — `createEntry`,
 * `updateEntry`, `restoreRevision`, `updateSection`, `updateCase` (notes), the
 * dossier revision a Keeper puts back — and by the live layer when it persists
 * a shared document, which then also *resets* the shared copy if anything had
 * to be taken out (`lib/live/docs.ts`), so the open tabs get the clean version.
 *
 * What it does, and nothing more — the shape of a document is otherwise left
 * exactly as it came:
 *   - a `link` mark with an unsafe `href` is removed; the words stay;
 *   - an `image` whose `src` is not an upload of this archive is removed;
 *     its `alt` and `title` are clipped;
 *   - an `entryLink` keeps only a hex colour, an icon *name*, a slug of
 *     slug characters, and a label of at most 200 characters — its colour goes
 *     into a `style` attribute on every reader's screen.
 * Anything that is not an object, or nested deeper than 64, is dropped.
 *
 * Returns a new value; the input is not changed. A non-object (null, a string)
 * comes back as it was, because the callers already treat that as "no text".
 */
export function cleanDoc<T>(doc: T): T {
  if (!doc || typeof doc !== 'object') return doc;

  /*
   * Only what is unsafe changes, and everything else is left byte for byte as
   * it came — the live layer compares before and after and resets a shared
   * document when they differ, so a "tidier" value here would reset rooms that
   * were never dirty, under the hands of people typing in them.
   */
  const walk = (node: ProseNode, depth: number): ProseNode | null => {
    if (!node || typeof node !== 'object' || depth > 64) return null;
    const out: ProseNode = { ...node };

    if (node.type === 'image') {
      const src = safeImageSrc(node.attrs?.src);
      if (!src) return null;
      const attrs: Record<string, unknown> = { ...node.attrs };
      if (src !== node.attrs?.src) attrs.src = src;
      for (const key of ['alt', 'title'] as const) {
        const value = attrs[key];
        if (value != null && typeof value !== 'string') attrs[key] = null;
        else if (typeof value === 'string' && value.length > 300) attrs[key] = value.slice(0, 300);
      }
      out.attrs = attrs;
    }

    if (node.type === 'entryLink' && node.attrs) {
      const attrs: Record<string, unknown> = { ...node.attrs };
      const { id, label, slug, icon, colour } = attrs;
      if (typeof id !== 'string') attrs.id = '';
      else if (id.length > 64) attrs.id = id.slice(0, 64);
      if (typeof label !== 'string') attrs.label = '';
      else if (label.length > 200) attrs.label = label.slice(0, 200);
      if (typeof slug !== 'string' || !/^[a-z0-9-]{0,120}$/.test(slug)) attrs.slug = '';
      if (icon != null && icon !== '' && (typeof icon !== 'string' || !/^[a-z0-9-]{1,40}$/.test(icon))) attrs.icon = null;
      if (colour != null && colour !== '' && (typeof colour !== 'string' || !HEX_COLOUR.test(colour))) attrs.colour = null;
      out.attrs = attrs;
    }

    if (Array.isArray(node.marks)) {
      const kept = node.marks.filter(
        (mark) =>
          mark && typeof mark === 'object' && typeof mark.type === 'string' &&
          (mark.type !== 'link' || isSafeHref(mark.attrs?.href)),
      );
      if (kept.length !== node.marks.length) {
        if (kept.length) out.marks = kept;
        else delete out.marks;
      }
    }

    if (Array.isArray(node.content)) {
      out.content = node.content
        .map((child) => walk(child, depth + 1))
        .filter((child): child is ProseNode => child !== null);
    }
    return out;
  };

  return (walk(doc as ProseNode, 0) ?? EMPTY_DOC) as T;
}
