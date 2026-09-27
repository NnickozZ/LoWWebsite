import { isHandle, tokenFor } from './shortTokens.mjs';

/**
 * §97, ronde 58: het lek in de lopende tekst — de vorm van een verwijzing in
 * een rijk document, zonder database, zonder React en zonder DOM. Gedeeld door
 * de browser (`EntryLink`), de server (`lib/entries/doc.ts`,
 * `lib/entries/docRefs.ts`) en de CLI (`docUpgrade.mjs`, de migratie
 * `0035_de_lopende_tekst`, `scripts/restore.mjs`, de seeds) — regel 4: een
 * `.mjs` is wat alle drie lezen.
 *
 * Een rijk document (de tekst van een artikel, een sectie, de dossiernotities)
 * is ProseMirror-JSON en gaat als één Yjs-document naar iedereen in de kamer.
 * Een `entryLink`-node droeg tot deze ronde `id`, `label`, `slug`, `icon` en
 * `colour` van het artikel dat hij noemde — naar iedereen die de tekst mocht
 * lezen, ook als het genoemde artikel voor die lezer verborgen was. Sinds §97
 * draagt hij **alleen een handvat** (`{ handle }`), precies zoals een kort vak
 * sinds §95 een `⟦h⟧` draagt, in dezelfde tabel `mention_handles`. De naam
 * wordt per kijker opgezocht (`resolveHandles`), en een handvat dat de kijker
 * niet mag volgen is voor hem niets.
 *
 * *Legacy* heet hier een `entryLink` met een `id` en zonder handvat: wat er vóór
 * 0035 stond, wat een oude seed of een test nog schrijft, en wat een oude tab
 * nog stuurt. De server zet het bij het schrijven om (`cleanDocRefs`), de
 * migratie in één keer (`upgradeDocs`).
 */

export const LINK = 'entryLink';

/** @param {any} node */
export function isLink(node) {
  return Boolean(node && typeof node === 'object' && node.type === LINK);
}

/** Het handvat van een `entryLink`, of null. @param {any} node */
export function linkHandle(node) {
  const handle = node?.attrs?.handle;
  return isHandle(handle) ? handle : null;
}

/** Het id van een legacy `entryLink` (zonder geldig handvat), of null. @param {any} node */
export function legacyLinkId(node) {
  if (linkHandle(node)) return null;
  const id = node?.attrs?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Elk handvat in het document, één keer, in volgorde.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function linkHandlesIn(doc) {
  /** @type {Set<string>} */
  const seen = new Set();
  walk(doc, (node) => {
    if (!isLink(node)) return;
    const handle = linkHandle(node);
    if (handle) seen.add(handle);
  });
  return [...seen];
}

/**
 * Elk id van een legacy `entryLink`, één keer, in volgorde.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function legacyLinkIdsIn(doc) {
  /** @type {Set<string>} */
  const seen = new Set();
  walk(doc, (node) => {
    if (!isLink(node)) return;
    const id = legacyLinkId(node);
    if (id) seen.add(id);
  });
  return [...seen];
}

/** @param {unknown} doc @param {(node: any) => void} visit */
function walk(doc, visit, depth = 0) {
  if (!doc || typeof doc !== 'object' || depth > 64) return;
  const node = /** @type {any} */ (doc);
  visit(node);
  if (Array.isArray(node.content)) for (const child of node.content) walk(child, visit, depth + 1);
}

/**
 * Een nieuw document waarin elke `entryLink` door `fn` is gegaan: een node
 * terug is die node, `null` is weg. Wat geen `entryLink` is, blijft hetzelfde
 * object (de kamer vergelijkt ervoor en erna). `changed` zegt of er iets anders
 * werd.
 *
 * @param {unknown} doc
 * @param {(node: any) => any | null} fn
 * @returns {{ doc: unknown, changed: boolean }}
 */
export function mapLinks(doc, fn) {
  let changed = false;
  /** @param {any} node @param {number} depth @returns {any} */
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 64) return node;
    if (isLink(node)) {
      const next = fn(node);
      if (next !== node) changed = true;
      return next;
    }
    if (!Array.isArray(node.content)) return node;
    let inner = false;
    const content = [];
    for (const child of node.content) {
      const next = visit(child, depth + 1);
      if (next !== child) inner = true;
      if (next !== null && next !== undefined) content.push(next);
    }
    return inner ? { ...node, content } : node;
  };
  const out = visit(doc, 0);
  return { doc: out, changed };
}

/** De vorm die een `entryLink` sinds §97 opgeslagen heeft: alleen zijn handvat. @param {string} handle */
export function linkNode(handle) {
  return { type: LINK, attrs: { handle } };
}

/** Node types that read as a line break when flattening to plain text. */
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
 * De platte tekst van een document (`body_text`, `notes_text`, de geschiedenis,
 * een voorstel). Een `entryLink` met een handvat wordt het token `⟦h⟧`, precies
 * zoals in een kort vak — zodat een lezer hem per kijker kan projecteren
 * (`plainShort`) en de zoekindex hem kan weglaten (`indexShort`). Een legacy
 * `entryLink` levert **niets**: een naam die in een document stond, komt nooit
 * meer in een platte tekst terecht (rule 1).
 *
 * @param {unknown} doc
 * @returns {string}
 */
export function docText(doc) {
  /** @type {string[]} */
  const out = [];
  /** @param {any} node @param {number} depth */
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 64) return;
    if (node.type === 'text' && typeof node.text === 'string') {
      out.push(node.text.replace(/[⟦⟧]/g, ''));
      return;
    }
    if (isLink(node)) {
      const handle = linkHandle(node);
      if (handle) out.push(tokenFor(handle));
      return;
    }
    if (node.type === 'image') {
      const alt = node.attrs?.alt;
      if (typeof alt === 'string' && alt) out.push(alt.replace(/[⟦⟧]/g, ''));
      return;
    }
    if (Array.isArray(node.content)) for (const child of node.content) visit(child, depth + 1);
    if (node.type && BLOCK_TYPES.has(node.type)) out.push('\n');
  };
  visit(doc, 0);
  return out
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
