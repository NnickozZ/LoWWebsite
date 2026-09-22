import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { newHandle } from './shortUpgrade.mjs';
import { dropStrayDelimiters, handlesIn, isHandle, legacySpans, projectShort, splitShort, tokenFor } from './shortTokens.mjs';
import { entryNameIndex } from './mentions';
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
 * Wat de zoekindex van een kort vak leest: de namen zoals ze nu zijn, uit de hele
 * archief (niet uit de prullenbak), zoals `body_text` de labels van de lopende
 * tekst leest. De index geeft geen tekst terug, alleen welke artikelen er
 * passen, en die worden daarna per kijker gefilterd.
 */
export function indexShort(text: string): string {
  if (!text) return '';
  const handles = handlesIn(text);
  if (!handles.length) return text;
  const rows = db
    .select({ handle: schema.mentionHandles.handle, name: schema.entries.name })
    .from(schema.mentionHandles)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.mentionHandles.entryId))
    .where(and(inArray(schema.mentionHandles.handle, handles), isNull(schema.entries.deletedAt)))
    .all();
  const names = new Map(rows.map((row) => [row.handle, row.name]));
  return projectShort(text, (handle: string) => names.get(handle) ?? null);
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
 *     wegliet, komt terug — achteraan, want waar het stond kon hij niet zien
 *     (§67: *you cannot remove what you cannot see*).
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
    if (back.length) text = `${text.replace(/\s+$/, '')}${text.trim() ? ' ' : ''}${back.map(tokenFor).join(' ')}`;
  }
  return text;
}

/**
 * `[[Naam]]` that arrives as letters — typed out in full rather than picked, or
 * carried over from a kaartje, a speld or a gebeurtenis that still writes the
 * old shorthand (a prefill of *Nieuw artikel*) — becomes a chip on its way in,
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
