import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { alignedDelta } from '@/lib/editor/shortBox';
import { newHandle } from './shortUpgrade.mjs';
import { dropStrayDelimiters, handlesIn, isHandle, legacySpans, projectShort, splitShort, tokenFor } from './shortTokens.mjs';
import { entryNameIndex } from './mentions';
import { legacyLinkId, legacyLinkIdsIn, linkHandle, linkHandlesIn, linkNode, mapLinks } from './docLinks.mjs';
import { visibleEntryCondition, type Viewer } from './visibility';

/**
 * §95, ronde 56: de server-helft van één regel, één id.
 *
 * Een kort vak bewaart `⟦handle⟧` (zie `shortTokens.mjs`). Dit bestand is alles
 * wat een handvat met het archief verbindt, en het houdt zich aan één regel:
 * **een naam komt er alleen uit via `resolveHandles`, per kijker, achter
 * `visibleEntryCondition`** (rule 1). Een handvat dat de kijker niet mag volgen,
 * staat niet in het antwoord — niet als dode chip, niet als leeg vakje. Voor hem
 * staat er op die plek niets, en dat is niet te onderscheiden van een artikel dat
 * vernietigd is of een handvat dat nooit bestond.
 */

/** Eén vermelding, zoals een lezer die mag zien. */
export type ShortChip = {
  entryId: string;
  name: string;
  slug: string;
  icon: string | null;
  colour: string | null;
};

/**
 * handvat → chip voor wat deze kijker mag zien, en `null` voor elk ander handvat
 * in de teksten — *niets te tekenen*, wat hetzelfde antwoord is voor een artikel
 * dat verborgen is, vernietigd is of nooit bestond. Zo gaat het naar een pagina
 * (`ShortChips`), die dan niets meer hoeft te vragen.
 */
export type ShortChipMap = Record<string, ShortChip | null>;

const MAX_HANDLES = 500;

/**
 * De chips van deze handvatten voor deze kijker. Eén query, wat er ook in zit.
 * Een handvat dat niet bestaat, een artikel in de prullenbak (voor de Keeper
 * net zo goed) en een artikel dat de kijker niet mag zien, zijn allemaal
 * *afwezig* in het antwoord.
 */
export function resolveHandles(viewer: Viewer, handles: Iterable<string>): Map<string, ShortChip> {
  const wanted = [...new Set([...handles].filter(isHandle))].slice(0, MAX_HANDLES);
  const out = new Map<string, ShortChip>();
  if (!wanted.length || !viewer) return out;
  const rows = db
    .select({
      handle: schema.mentionHandles.handle,
      entryId: schema.entries.id,
      name: schema.entries.name,
      slug: schema.entries.slug,
      icon: schema.entryTypes.icon,
      colour: schema.entryTypes.colour,
    })
    .from(schema.mentionHandles)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.mentionHandles.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(and(inArray(schema.mentionHandles.handle, wanted), visibleEntryCondition(viewer)))
    .all();
  for (const row of rows) {
    out.set(row.handle, { entryId: row.entryId, name: row.name, slug: row.slug, icon: row.icon ?? null, colour: row.colour ?? null });
  }
  return out;
}

/** De chips van een handvol teksten, als gewoon object — voor een pagina die ze aan de browser meegeeft. */
export function shortChipsFor(viewer: Viewer, texts: Iterable<string | null | undefined>): ShortChipMap {
  const handles = new Set<string>();
  for (const text of texts) if (typeof text === 'string') for (const handle of handlesIn(text)) handles.add(handle);
  const found = resolveHandles(viewer, handles);
  const out: ShortChipMap = {};
  for (const handle of handles) out[handle] = found.get(handle) ?? null;
  return out;
}

/**
 * Een nieuw handvat voor een artikel dat deze kijker mag zien, of null. Dit is
 * de enige weg waarlangs een browser er een krijgt (`POST /api/mentions/handle`):
 * wie het artikel niet mag zien, kan er ook geen vermelding van maken.
 */
export function mintHandle(entryId: string, viewer: Viewer): string | null {
  if (!viewer || typeof entryId !== 'string' || !entryId) return null;
  const seen = db
    .select({ id: schema.entries.id })
    .from(schema.entries)
    .where(and(eq(schema.entries.id, entryId), visibleEntryCondition(viewer)))
    .get();
  if (!seen) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = newHandle();
    try {
      db.insert(schema.mentionHandles).values({ handle, entryId, createdBy: viewer.id }).run();
      return handle;
    } catch {
      /* a collision in 71 bits: draw again */
    }
  }
  return null;
}

/**
 * De tekst zoals deze kijker hem als letters leest: een chip is de naam, een
 * chip die hij niet mag zien is niets. Voor de plekken die geen chip kunnen
 * tekenen — de geschiedenis, een voorstel, de prullenbak, het web.
 */
export function plainShort(viewer: Viewer, text: string): string {
  if (!text) return '';
  const handles = handlesIn(text);
  if (!handles.length) return text;
  const chips = resolveHandles(viewer, handles);
  return projectShort(text, (handle: string) => chips.get(handle)?.name ?? null).trim();
}

/**
 * Wat de zoekindex van een kort vak leest — en sinds §97 ook van de lopende
 * tekst (`body_text` draagt dezelfde tokens): de tekst **zonder** de namen van
 * de chips. De index is één tabel voor iedereen en kan niet per kijker
 * geschrapt worden; een naam van een artikel dat de zoeker niet mag zien, zou
 * er een vindplaats van maken ("zoek *Geheim* en je vindt wie het noemt").
 * §95 zette hier de namen van nu; ronde 58 draait dat om. Wie een naam zoekt,
 * vindt dat artikel zelf op naam, en wie het noemt via `entry_links`, per
 * kijker (`searchEntries`).
 */
export function indexShort(text: string): string {
  if (!text) return '';
  if (!handlesIn(text).length) return text;
  return projectShort(text, () => null);
}

/**
 * §89 voor een kort vak — de `cleanDoc` van een string. Op elke weg waarlangs
 * een korte beschrijving, een samenvatting of een infoboxveld Tekst / Lange
 * tekst het archief in gaat (`createEntry`, `updateEntry`, `createCase`,
 * `updateCase`), want een browser stuurt wat hij wil.
 *
 *   - Geen stuurtekens. Een vak van één regel houdt geen regeleinde (A8); een
 *     Lange tekst wel.
 *   - Geen losse `⟦` of `⟧`: een token is een geldig handvat tussen die twee,
 *     of het is er niet.
 *   - Een handvat dat er vóór deze schrijfactie nog niet stond, moet bestaan
 *     én naar een artikel wijzen dat de schrijver mag zien. Anders gaat het weg:
 *     je noemt niet wat je niet kunt zien.
 *   - Een handvat dat er wél stond, dat de schrijver niet kan zien en dat hij
 *     wegliet, komt terug — sinds §98 op zijn plek (`putBack`), en alleen
 *     achteraan als de hele tekst vervangen is (§67: *you cannot remove what
 *     you cannot see*).
 *
 * Verder blijft de tekst letter voor letter wat er kwam: de kamer vergelijkt
 * ervoor en erna, en een "nettere" waarde zou een kamer resetten onder de handen
 * van wie erin typt.
 */
export function cleanShort(
  value: unknown,
  options: { prev?: string | null; actor: Viewer | 'system'; multiline?: boolean },
): string {
  let text = typeof value === 'string' ? value : '';
  // eslint-disable-next-line no-control-regex
  text = text.replace(options.multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, (ch) =>
    ch === '\n' || ch === '\r' || ch === '\t' ? ' ' : '',
  );
  if (options.multiline) text = text.replace(/\r\n?/g, '\n');
  text = dropStrayDelimiters(text);
  text = upgradeBrackets(text, options.actor);

  const prev = typeof options.prev === 'string' ? options.prev : '';
  const before = new Set(handlesIn(prev));
  const now = handlesIn(text);
  const fresh = now.filter((handle) => !before.has(handle));
  const missing = [...before].filter((handle) => !now.includes(handle));
  if (!fresh.length && !missing.length) return text;

  const system = options.actor === 'system';
  const actor = system ? null : (options.actor as Viewer);

  if (fresh.length) {
    const allowed = system ? existingHandles(fresh) : new Set(resolveHandles(actor, fresh).keys());
    if (fresh.some((handle) => !allowed.has(handle))) {
      text = splitShort(text)
        .map((part) => (part.kind === 'chip' ? (before.has(part.handle) || allowed.has(part.handle) ? tokenFor(part.handle) : '') : part.text))
        .join('');
    }
  }

  if (missing.length && !system) {
    const seen = resolveHandles(actor, missing);
    const stillThere = existingHandles(missing.filter((handle) => !seen.has(handle)));
    const back = missing.filter((handle) => stillThere.has(handle));
    if (back.length) text = putBack(prev, text, back);
  }
  return text;
}

/**
 * §98 (ronde 59): `cleanShort` for the short texts of the canvases and the
 * descriptions — a speld, a gebeurtenis, a los kaartje, the omschrijving of a
 * landkaart, tijdlijn or stamboom, an overzicht's inleiding. Those columns were
 * always stored trimmed and capped, so this is `cleanShort` plus that, and one
 * more answer: whether the cleaning changed what came in (`cleaned`), which is
 * what a live write asks before it resets its room. Trailing space alone is not
 * a change — the hand typing in the room is about to type the next word.
 */
export function cleanShortWrite(
  raw: unknown,
  options: { prev?: string | null; actor: Viewer | 'system'; multiline?: boolean; max: number },
): { text: string; cleaned: boolean } {
  const given = (typeof raw === 'string' ? raw : '').slice(0, options.max);
  const clean = cleanShort(given, { prev: options.prev, actor: options.actor, multiline: options.multiline });
  return { text: clean.trim(), cleaned: clean !== given };
}

/**
 * §98 (ronde 59): een handvat dat de schrijver niet kon zien en wegliet, komt
 * **op zijn plek** terug in plaats van achteraan (§67). "Zijn plek" is wat het
 * verschil tussen voor en na zegt: `alignedDelta` vindt het ene stuk dat
 * veranderde, en een token dat in dat stuk stond gaat naar de rand ervan waar
 * het het dichtst bij stond. Alleen als de hele tekst vervangen is, is er geen
 * plek meer, en dan gaat het achteraan zoals voorheen.
 */
function putBack(prev: string, next: string, back: string[]): string {
  const delta = alignedDelta(prev, next);
  const whole = !delta || (delta.at === 0 && delta.remove >= prev.length);
  if (whole) return `${next.replace(/\s+$/, '')}${next.trim() ? ' ' : ''}${back.map(tokenFor).join(' ')}`;
  const regionEnd = delta.at + delta.remove;
  const toStart: string[] = [];
  const toEnd: string[] = [];
  for (const part of splitShort(prev)) {
    if (part.kind !== 'chip' || !back.includes(part.handle)) continue;
    // Outside the changed stretch cannot happen for a token that went; be safe.
    if (part.start - delta.at < regionEnd - part.end) toStart.push(part.handle);
    else toEnd.push(part.handle);
  }
  for (const handle of back) if (!toStart.includes(handle) && !toEnd.includes(handle)) toEnd.push(handle);
  const at = delta.at;
  const end = delta.at + delta.insert.length;
  const spaced = (before: string, tokens: string[], after: string) => {
    if (!tokens.length) return '';
    const joined = tokens.map(tokenFor).join(' ');
    return `${before && !/\s$/.test(before) ? ' ' : ''}${joined}${after && !/^\s/.test(after) ? ' ' : ''}`;
  };
  const head = next.slice(0, at);
  const middle = next.slice(at, end);
  const tail = next.slice(end);
  const startPart = spaced(head, toStart, middle + tail);
  const middleAfter = head + startPart + middle;
  return `${middleAfter}${spaced(middleAfter, toEnd, tail)}${tail}`;
}

/**
 * `[[Naam]]` that arrives as letters — typed out in full rather than picked, or
 * sent by a client or a script that still writes the old shorthand — becomes a
 * chip on its way in,
 * read exactly as migration 0034 and the reader before it read it: the oldest
 * artikel with that name. Only when this hand may see that artikel; otherwise
 * the letters stay letters. `@Naam` is left alone: in a short box an `@` the
 * hand did not pick from the list is an `@` the hand said no to.
 */
function upgradeBrackets(text: string, actor: Viewer | 'system'): string {
  if (!text.includes('[[')) return text;
  const byName = entryNameIndex();
  const spans = legacySpans(text, byName).filter((span) => span.source === 'bracket' && span.entryId);
  if (!spans.length) return text;
  const system = actor === 'system';
  const who: Viewer = system ? null : actor;
  const ids = [...new Set(spans.map((span) => span.entryId as string))];
  const seen = system
    ? new Set(ids)
    : new Set(
        db
          .select({ id: schema.entries.id })
          .from(schema.entries)
          .where(and(inArray(schema.entries.id, ids), visibleEntryCondition(who)))
          .all()
          .map((row) => row.id),
      );
  let out = '';
  let at = 0;
  for (const span of spans) {
    const id = span.entryId as string;
    if (!seen.has(id) || span.start < at) continue;
    const handle = system ? mintSystemHandle(id) : mintHandle(id, who);
    if (!handle) continue;
    out += text.slice(at, span.start) + tokenFor(handle);
    at = span.end;
  }
  return out + text.slice(at);
}

function mintSystemHandle(entryId: string): string | null {
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = newHandle();
    try {
      db.insert(schema.mentionHandles).values({ handle, entryId, createdBy: null }).run();
      return handle;
    } catch {
      /* draw again */
    }
  }
  return null;
}

function existingHandles(handles: string[]): Set<string> {
  const valid = handles.filter(isHandle);
  if (!valid.length) return new Set();
  return new Set(
    db
      .select({ handle: schema.mentionHandles.handle })
      .from(schema.mentionHandles)
      .innerJoin(schema.entries, eq(schema.entries.id, schema.mentionHandles.entryId))
      .where(inArray(schema.mentionHandles.handle, valid))
      .all()
      .map((row) => row.handle),
  );
}

/** Of een infoboxveld een kort vak van deze ronde is: Tekst of Lange tekst. */
export function isShortFieldKind(kind: string | undefined): kind is 'text' | 'longtext' {
  return kind === 'text' || kind === 'longtext';
}

/* ======================================================== §97, ronde 58 */

type DocNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: DocNode[]; marks?: unknown[] };

/**
 * §97: `cleanShort` voor een rijk document — de tekst van een artikel, een
 * sectie, de dossiernotities. Na `cleanDoc` (§89), op elke weg waarlangs zo'n
 * document het archief in gaat: `createEntry`, `updateEntry` (ook een voorstel),
 * `restoreRevision`, `updateSection`, `updateCase`, `restoreCaseRevision`. Via
 * de kamer net zo goed: de service zet de kamer recht als dit iets veranderde.
 *
 *   - Een `entryLink` is `{ handle }` en verder niets: geen `id`, geen `label`,
 *     geen `slug` — niets dat in de kamer of de RSC van een ander terechtkomt.
 *   - Een legacy `entryLink` (met een `id`, van een oude tab, een seed of een
 *     test) wordt een handvat als de schrijver dat artikel mag zien (`system`:
 *     als het bestaat), en valt anders weg.
 *   - Een handvat dat er vóór deze schrijfactie niet stond, moet bestaan én
 *     naar iets wijzen dat de schrijver mag zien. Anders valt het weg.
 *   - Een handvat dat er wél stond, dat de schrijver niet kan zien en dat hij
 *     wegliet, komt terug — op zijn plek als die nog te vinden is (na de
 *     woorden die ervoor stonden, of vóór de woorden erna), anders achteraan
 *     (§67: *you cannot remove what you cannot see*).
 *
 * Verder blijft het document object voor object wat er kwam: de kamer
 * vergelijkt ervoor en erna.
 */
export function cleanDocRefs<T>(doc: T, options: { prev?: unknown; actor: Viewer | 'system' }): T {
  if (!doc || typeof doc !== 'object') return doc;
  const system = options.actor === 'system';
  const actor = system ? null : (options.actor as Viewer);

  // 1. legacy → handle, or gone.
  let out: unknown = doc;
  const legacy = legacyLinkIdsIn(out);
  if (legacy.length) {
    const may = new Set(
      db
        .select({ id: schema.entries.id })
        .from(schema.entries)
        .where(system ? inArray(schema.entries.id, legacy) : and(inArray(schema.entries.id, legacy), visibleEntryCondition(actor)))
        .all()
        .map((row) => row.id),
    );
    out = mapLinks(out, (node) => {
      if (linkHandle(node)) return node;
      const id = legacyLinkId(node);
      if (!id || !may.has(id)) return GAP;
      const handle = system ? mintSystemHandle(id) : mintHandle(id, actor);
      return handle ? linkNode(handle) : GAP;
    }).doc;
  }

  // 2. a link is its handle and nothing else.
  out = mapLinks(out, (node) => {
    const handle = linkHandle(node);
    if (!handle) return null;
    const attrs = node.attrs ?? {};
    return Object.keys(attrs).length === 1 && node.marks === undefined && node.content === undefined ? node : linkNode(handle);
  }).doc;

  // 3. what is new must be yours to name.
  const before = new Set(linkHandlesIn(options.prev));
  const now = linkHandlesIn(out);
  const fresh = now.filter((handle) => !before.has(handle));
  if (fresh.length) {
    const allowed = system ? existingHandles(fresh) : new Set(resolveHandles(actor, fresh).keys());
    if (fresh.some((handle) => !allowed.has(handle))) {
      out = mapLinks(out, (node) => {
        const handle = linkHandle(node) as string;
        return before.has(handle) || allowed.has(handle) ? node : GAP;
      }).doc;
    }
  }
  // §101 naden: where a link fell away, its two spaces become one.
  out = closeGaps(out as DocNode);

  // 4. what you could not see, you did not take away.
  if (!system) {
    const present = new Set(linkHandlesIn(out));
    const missing = [...before].filter((handle) => !present.has(handle));
    if (missing.length) {
      const seenByActor = resolveHandles(actor, missing);
      const stillThere = existingHandles(missing.filter((handle) => !seenByActor.has(handle)));
      const back = missing.filter((handle) => stillThere.has(handle));
      if (back.length) out = putBackInDoc(out as DocNode, options.prev as DocNode, back);
    }
  }
  return out as T;
}

/*
 * §101 naden: a link that falls away (steps 1 and 3) leaves this marker where
 * it stood, so `closeGaps` can see what was on either side. "zag ⟦x⟧ bij de
 * sluis" without its chip read "zag  bij de sluis" — two spaces, which the
 * reading face shows and the next save kept. Only the seam is touched: two
 * spaces somebody typed elsewhere stay two, and step 4 puts a hidden link back
 * against the words of the *old* text, which this never changes.
 */
const GAP: DocNode = { type: '__gap' };

function closeGaps(doc: DocNode, depth = 0): DocNode {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.content) || depth > 64) return doc;
  let changed = false;
  const content: DocNode[] = [];
  const kids = [...doc.content]; // a copy: the seam is fixed here, never in what came in
  for (let i = 0; i < kids.length; i++) {
    const child = kids[i];
    if (child !== GAP) {
      const inner = closeGaps(child, depth + 1);
      if (inner !== child) changed = true;
      content.push(inner);
      continue;
    }
    changed = true;
    const prev = content[content.length - 1];
    const next = kids[i + 1];
    const prevText = prev?.type === 'text' ? (prev.text ?? '') : null;
    const nextText = next?.type === 'text' && next !== GAP ? (next.text ?? '') : null;
    const prevSpace = prevText !== null && /\s$/.test(prevText);
    const nextSpace = nextText !== null && nextText.startsWith(' ');
    // A space on both sides, or a space against the start of the line: the
    // one after goes. A space against the end of the line: the one before.
    if (nextSpace && (prevSpace || !prev)) kids[i + 1] = { ...next, text: nextText.slice(1) };
    else if (prevSpace && !next) content[content.length - 1] = { ...prev, text: prevText.replace(/ $/, '') };
  }
  if (!changed) return doc;
  // Drop a text that is empty now, and join two texts that wear the same marks.
  const joined: DocNode[] = [];
  for (const node of content) {
    if (node.type === 'text' && !node.text) continue;
    const last = joined[joined.length - 1];
    if (last?.type === 'text' && node.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(node.marks ?? [])) {
      joined[joined.length - 1] = { ...last, text: `${last.text ?? ''}${node.text ?? ''}` };
      continue;
    }
    joined.push(node);
  }
  return { ...doc, content: joined };
}

/** The inline text of a textblock, with a chip as one private character, and where each child starts. */
function inlineText(block: DocNode): string {
  let text = '';
  for (const child of block.content ?? []) {
    if (child.type === 'text' && typeof child.text === 'string') text += child.text;
    else text += '\u0000';
  }
  return text;
}

function isTextblock(node: DocNode): boolean {
  return Array.isArray(node.content) && node.content.some((child) => child.type === 'text' || child.type === 'entryLink' || child.type === 'hardBreak');
}

function textblocks(doc: DocNode, depth = 0, out: DocNode[] = []): DocNode[] {
  if (!doc || typeof doc !== 'object' || depth > 64) return out;
  if (isTextblock(doc) || doc.type === 'paragraph' || doc.type === 'heading') {
    out.push(doc);
    return out;
  }
  for (const child of doc.content ?? []) textblocks(child, depth + 1, out);
  return out;
}

/** Where a handle stood in the old document: the words right before it, and right after, in its line. */
function anchorOf(prev: DocNode, handle: string): { before: string; after: string } | null {
  for (const block of textblocks(prev)) {
    const children = block.content ?? [];
    const at = children.findIndex((child) => child.type === 'entryLink' && linkHandle(child) === handle);
    if (at < 0) continue;
    const words = (list: DocNode[]) => list.map((child) => (child.type === 'text' ? (child.text ?? '') : '\u0000')).join('');
    const before = words(children.slice(0, at)).split('\u0000').pop() ?? '';
    const after = words(children.slice(at + 1)).split('\u0000')[0] ?? '';
    return { before: before.slice(-40), after: after.slice(0, 40) };
  }
  return null;
}

/** The inline content of a block with `node` put in at text offset `offset`, splitting a text node if it must. */
function insertInline(block: DocNode, offset: number, node: DocNode): DocNode {
  const content: DocNode[] = [];
  let at = 0;
  let placed = false;
  for (const child of block.content ?? []) {
    const width = child.type === 'text' ? (child.text ?? '').length : 1;
    if (!placed && offset <= at) {
      content.push(node);
      placed = true;
    } else if (!placed && child.type === 'text' && offset < at + width) {
      const cut = offset - at;
      content.push({ ...child, text: (child.text ?? '').slice(0, cut) }, node, { ...child, text: (child.text ?? '').slice(cut) });
      placed = true;
      at += width;
      continue;
    }
    content.push(child);
    at += width;
  }
  if (!placed) content.push(node);
  return { ...block, content };
}

function replaceBlock(doc: DocNode, target: DocNode, next: DocNode, depth = 0): DocNode {
  if (doc === target) return next;
  if (!Array.isArray(doc.content) || depth > 64) return doc;
  let changed = false;
  const content = doc.content.map((child) => {
    const replaced = replaceBlock(child, target, next, depth + 1);
    if (replaced !== child) changed = true;
    return replaced;
  });
  return changed ? { ...doc, content } : doc;
}

/**
 * §67 in a document: each handle back where it stood, as near as the new text
 * lets us tell — after the words that came before it, or before the words that
 * came after; and when neither is there any more, at the end of the last line.
 */
function putBackInDoc(doc: DocNode, prev: DocNode, handles: string[]): DocNode {
  let out = doc;
  for (const handle of handles) {
    const node = linkNode(handle) as DocNode;
    const anchor = prev ? anchorOf(prev, handle) : null;
    let done = false;
    if (anchor) {
      for (const block of textblocks(out)) {
        const text = inlineText(block);
        let offset = -1;
        if (anchor.before.trim()) {
          const found = text.indexOf(anchor.before);
          if (found >= 0) offset = found + anchor.before.length;
        }
        if (offset < 0 && anchor.after.trim()) {
          const found = text.indexOf(anchor.after);
          if (found >= 0) offset = found;
        }
        if (offset < 0) continue;
        out = replaceBlock(out, block, insertInline(block, offset, node));
        done = true;
        break;
      }
    }
    if (done) continue;
    const blocks = textblocks(out);
    const last = blocks[blocks.length - 1];
    if (last) {
      out = replaceBlock(out, last, insertInline(last, Number.MAX_SAFE_INTEGER, node));
    } else {
      out = { ...out, content: [...(out.content ?? []), { type: 'paragraph', content: [node] }] };
    }
  }
  return out;
}
