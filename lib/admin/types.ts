import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { db, schema, sqlite } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import { RESERVED_WIKI_SLUGS, slugify } from '@/lib/slug';
import { cleanFields } from '@/lib/fieldKinds';
import { allowedFieldKeys, listBlockKeys, orphanValueCounts } from '@/lib/entries/fieldValues';
import { cleanBlocks, cleanTypeText, resolveBlocks, type PageBlock, type TypeText } from '@/lib/pageBlocks';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §11's entry-type editor. The seed writes these rows on first start; from the
 * moment a Keeper can edit them, the seed must stop overwriting the words (see
 * `seedBaseline`), or every restart would undo their work.
 */

export type TypeRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: FieldDef[];
  /** §11: what this soort's page is made of, already resolved for the editor. */
  blocks: PageBlock[];
  /** This soort's own wording for the few shared sentences that read badly. */
  pageText: TypeText;
  sortOrder: number;
  /** §24, kept and unread: this soort used to be made only inside a dossier. */
  caseOnly: boolean;
  /**
   * §80: alleen de Keeper maakt hier artikelen van — and the flag `catalogueFor`
   * asks, so it is also what decides whether a soort can be huisraad at all.
   */
  keeperMade: boolean;
  /** §80: er is er één van in de wereld — what fills `room_slots.claim`. */
  oneOfAKind: boolean;
  /** §49: a new artikel of this soort starts with the dossier prefix ticked. */
  prefixDefault: boolean;
  /** How many entries are filed under it — a type in use should not vanish quietly. */
  entryCount: number;
  /**
   * §38: values still stored under a key this soort no longer has, per key.
   * Nothing is destroyed when a field goes away — putting the field back brings
   * its values with it — so this is the Keeper's only way to *see* what is
   * being kept, and `purgeOrphanField` their only way to be rid of it.
   */
  orphans: { key: string; count: number }[];
};

export function listTypesForAdmin(): TypeRow[] {
  const types = db
    .select()
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all();
  const counts = new Map<string, number>();
  // §38: the stored infobox of every artikel, grouped by soort, so the orphan
  // count below is one pass rather than a query per soort.
  const stored = new Map<string, Record<string, unknown>[]>();
  for (const row of db
    .select({ typeId: schema.entries.typeId, fields: schema.entries.fields })
    .from(schema.entries)
    .all()) {
    counts.set(row.typeId, (counts.get(row.typeId) ?? 0) + 1);
    const list = stored.get(row.typeId) ?? [];
    list.push((row.fields as Record<string, unknown> | null) ?? {});
    stored.set(row.typeId, list);
  }
  return types.map((type) => {
    const blocks = resolveBlocks(type.blocks);
    return {
      id: type.id,
      slug: type.slug,
      label: type.label,
      icon: type.icon,
      colour: type.colour,
      border: type.border,
      fields: type.fields ?? [],
      blocks,
      pageText: cleanTypeText(type.pageText),
      sortOrder: type.sortOrder,
      caseOnly: Boolean(type.caseOnly),
      keeperMade: Boolean(type.keeperMade),
      oneOfAKind: Boolean(type.oneOfAKind),
      prefixDefault: Boolean(type.prefixDefault),
      entryCount: counts.get(type.id) ?? 0,
      // Both sources of the whitelist, or every hand-filled list on the page
      // would be reported as an orphan of itself.
      orphans: orphanValueCounts(
        allowedFieldKeys(type.fields ?? [], listBlockKeys(blocks)),
        stored.get(type.id) ?? [],
      ),
    };
  });
}

/**
 * §38: throw away every value stored under one key of one soort, for good.
 *
 * The escape hatch, and nothing more. A field taken away in the editor keeps
 * its values — that is the promise `TypeEditor` makes and this module keeps —
 * so this is the only road that actually deletes one, it is a Keeper's, it
 * names one key at a time, and it refuses a key the soort still has, because
 * that would be a bulk wipe of a live field rather than a tidy-up.
 */
export function purgeOrphanField(typeId: string, key: string, keeperId: string): number {
  const type = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!type) throw new Error('Soort artikel niet gevonden');

  const allowed = allowedFieldKeys(type.fields ?? [], listBlockKeys(resolveBlocks(type.blocks)));
  if (allowed.has(key)) {
    throw new Error('Dit veld bestaat nog. Haal het eerst weg bij de velden van deze soort.');
  }

  const rows = db
    .select({ id: schema.entries.id, fields: schema.entries.fields })
    .from(schema.entries)
    .where(eq(schema.entries.typeId, typeId))
    .all();

  let wiped = 0;
  for (const row of rows) {
    const fields = (row.fields as Record<string, unknown> | null) ?? {};
    if (!(key in fields)) continue;
    const next = { ...fields };
    delete next[key];
    db.update(schema.entries).set({ fields: next }).where(eq(schema.entries.id, row.id)).run();
    wiped += 1;
  }

  logAudit({
    actorId: keeperId,
    action: 'entry_type.field_values_purged',
    targetType: 'entry_type',
    targetId: typeId,
    meta: { key, entries: wiped },
  });
  return wiped;
}

export type TypePatch = Partial<{
  /**
   * §11: the soort's address. `entry_types.id` *is* the slug (see `createType`),
   * so renaming one renames both, and everything pointing at the old value has
   * to come along — see `renameTypeSlug`.
   */
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: unknown;
  blocks: unknown;
  pageText: unknown;
  sortOrder: number;
  /**
   * §49: the soort's habit, not a rule. `caseOnly` is deliberately not patchable
   * any more — it gated where a soort could be made, and nothing gates that.
   */
  prefixDefault: boolean;
  /**
   * §80: en deze twee *zijn* wél patchbaar — met opzet, en om precies de
   * reden waarom `caseOnly` het niet is.
   *
   * `caseOnly` is een dode kolom: niets leest hem meer, dus een vinkje ervoor
   * zou een knop zijn die nergens op zit. Deze twee worden juist elke dag
   * gelezen, en allebei door code die een Keeper niet anders kan bereiken:
   *
   *  - `keeperMade` is de vraag die `catalogueFor` stelt (alleen soorten die
   *    de Keeper zelf maakt staan in de catalogus) én die `createEntry`
   *    stelt (een speler mag er geen maken). Zonder dit vinkje is de enige
   *    weg naar een tweede soort huisraad een migratie — wat §79 en §80
   *    allebei hebben moeten doen, en wat deze ronde juist opheft.
   *  - `oneOfAKind` is wat `room_slots.claim` vult, en dus het verschil
   *    tussen een voorwerp (er is er één in de wereld) en huisraad (twee
   *    onderzoekers mogen dezelfde lamp hebben). Dat verschil hoort bij de
   *    soort, en de soort hoort van de Keeper te zijn.
   *
   * Allebei zijn ze een *regel over wie wat mag*, geen opmaak, dus de patch
   * eronder vraagt apart of de hand die hem stuurt van een Keeper is. Het
   * scherm is al alleen voor een Keeper; dit is het slot aan de buitenkant
   * van diezelfde deur.
   */
  keeperMade: boolean;
  oneOfAKind: boolean;
}>;

/**
 * §80: is de hand achter deze patch echt van een Keeper?
 *
 * Alleen gevraagd voor de twee vinkjes hierboven, en alleen omdat die twee
 * over rechten gaan in plaats van over opmaak. Elke andere weg hiernaartoe
 * komt al langs `requireKeeper()` in de server action; dit is het tweede slot,
 * op de plek waar de regel zelf staat, zodat een nieuwe aanroeper hem niet per
 * ongeluk kan overslaan.
 */
function assertKeeper(keeperId: string) {
  const row = db
    .select({ isKeeper: schema.users.isKeeper })
    .from(schema.users)
    .where(eq(schema.users.id, keeperId))
    .get();
  if (!row?.isKeeper) throw new Error('Alleen de Keeper past dit aan.');
}

export function updateType(typeId: string, patch: TypePatch, keeperId: string) {
  const existing = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!existing) throw new Error('Soort artikel niet gevonden');

  // The address first, and on its own: everything below writes to the row by
  // its id, and after a rename that id is a different string.
  let id = typeId;
  if (patch.slug !== undefined) {
    id = renameTypeSlug(typeId, patch.slug, keeperId);
  }

  const values: Record<string, unknown> = {};
  if (patch.label !== undefined && patch.label.trim()) values.label = patch.label.trim().slice(0, 60);
  if (patch.icon !== undefined && patch.icon.trim()) values.icon = patch.icon.trim();
  if (patch.colour !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.colour)) {
    values.colour = patch.colour;
  }
  if (patch.border !== undefined) values.border = patch.border;
  if (patch.fields !== undefined) values.fields = cleanFields(patch.fields);
  // §11: `cleanBlocks` is what guarantees the five built-ins are all still
  // there, so a saved page can never be one without a body to type in.
  if (patch.blocks !== undefined) values.blocks = cleanBlocks(patch.blocks);
  if (patch.pageText !== undefined) values.pageText = cleanTypeText(patch.pageText);
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.prefixDefault !== undefined) values.prefixDefault = patch.prefixDefault;
  // §80: de twee vinkjes die over rechten gaan — zie `TypePatch` voor waarom
  // ze wél patchbaar zijn waar `caseOnly` dat niet is, en waarom ze hun eigen
  // slot krijgen.
  if (patch.keeperMade !== undefined || patch.oneOfAKind !== undefined) {
    assertKeeper(keeperId);
    if (patch.keeperMade !== undefined) values.keeperMade = patch.keeperMade;
    if (patch.oneOfAKind !== undefined) values.oneOfAKind = patch.oneOfAKind;
  }
  if (!Object.keys(values).length) return;

  db.update(schema.entryTypes).set(values).where(eq(schema.entryTypes.id, id)).run();

  /*
   * §82: en als "er is er maar één van" áán gaat, moet wat er al ligt dat ook
   * zeggen.
   *
   * `room_slots.claim` is wat de unieke index bewaakt (§80), en hij wordt
   * geschreven op het moment dat iets wordt neergelegd — naar de vlag zoals
   * die dán stond. Zet een Keeper de vlag later om, dan dragen de rijen die er
   * al liggen wel een `entry_id` maar geen `claim`: de lézers (de catalogus,
   * de winkel) zouden het ding dan blijven aanbieden terwijl `buyFurnishing`
   * het weigert, want die kijkt voor een uniek ding naar `entry_id` in het hele
   * archief. §17's regel 4 nog een keer, nu met de tijd ertussen.
   *
   * Sinds ronde 41 is die vlag een vinkje in Beheer, dus dit is bereikbaar
   * geworden. Aan: de bestaande rijen claimen zichzelf alsnog. Uit: de claims
   * gaan eraf, want dan is er niets meer uniek aan.
   */
  if (patch.oneOfAKind !== undefined) {
    const placed = db
      .select({ slotId: schema.roomSlots.id, roomId: schema.roomSlots.roomId, entryId: schema.roomSlots.entryId })
      .from(schema.roomSlots)
      .innerJoin(schema.entries, eq(schema.entries.id, schema.roomSlots.entryId))
      .where(eq(schema.entries.typeId, id))
      .all();
    for (const row of placed) {
      db.update(schema.roomSlots)
        .set({ claim: patch.oneOfAKind ? row.entryId : null })
        // §93: `room_id` in de WHERE, zodat `room:{id}` beweegt (§5, de
        // TABLES-regel) — het filtert niets, het laat de logger de kamer zien.
        .where(and(eq(schema.roomSlots.id, row.slotId), eq(schema.roomSlots.roomId, row.roomId)))
        .run();
    }
  }

  logAudit({
    actorId: keeperId,
    action: 'entry_type.edited',
    targetType: 'entry_type',
    targetId: id,
    meta: { slug: id, keys: Object.keys(values) },
  });
}

/** One rename at a time; see below. */
let renaming = false;

/**
 * §11: renaming a soort all the way into its address.
 *
 * `Relieken` shipped as `object` and `Voorwerpen` as `item`: the labels were
 * changed in the seed, the slugs could not be, and a Keeper had no way to fix
 * an address that no longer matches the name. This is that way.
 *
 * `entry_types.id` *is* the slug, so this is not one column but a small
 * cascade, and it runs in one transaction because a half-done rename is an
 * archive where some artikelen have a soort and some do not:
 *
 *   - `entry_types.id` and `entry_types.slug` (the row itself);
 *   - `entries.type_id`, every artikel filed under it;
 *   - `ofType` on every soort's *fields* — which artikelen an `entry_link`
 *     field may point at (`lib/fieldKinds.ts`);
 *   - `ofType` and `fromType` on every soort's *page blocks* — what a
 *     hand-filled list may hold and what a self-filling list looks through
 *     (`lib/pageBlocks.ts`).
 *
 * What it deliberately does **not** rewrite is anybody's saved URL. That is
 * what the warning above the save button is for: `/wiki/<oude-slug>` and a
 * filter link with `?type=` in it stop working, and no amount of cascading
 * inside the database can reach a link in somebody's notes.
 *
 * Returns the new id, which is what the rest of the save must write to.
 *
 * §58: there is a **second** copy of this cascade, in `lib/db/seed.mjs`
 * (`renameSeededType`). Round 28 moved `lore` to `werken` in the seed because
 * Nick asked for the rename rather than doing it by hand in this editor, and
 * the seed is plain JS without the drizzle layer, so it cannot call in here.
 * The two must stay in step: a new thing that points at a soort by slug is a
 * step in *both* functions, or a Keeper's rename and the seed's will move
 * different halves of the archive.
 */
export function renameTypeSlug(typeId: string, wanted: string, keeperId: string): string {
  const next = slugify(wanted);
  // `slugify` never returns nothing — it falls back to `entry` — so an address
  // typed as spaces or punctuation would silently land there. Refused, unless
  // that is genuinely what was typed.
  if (!wanted.trim() || (next === 'entry' && !/^\s*entry\s*$/i.test(wanted))) {
    throw new Error('Geef de soort een adres.');
  }
  /*
   * §75: the wiki's own addresses are not a soort's to take. `/wiki/alles` is
   * the browse list and `/wiki/overzicht/…` is where an overzicht lives, so a
   * soort called "Alles" would sit on top of one of them and the tab row would
   * quietly stop working. The same list is in `lib/overzichten/service.ts`,
   * where a new overzicht's slug is kept off it.
   */
  if (RESERVED_WIKI_SLUGS.includes(next)) {
    throw new Error(`Het adres “${next}” is van de wiki zelf.`);
  }
  const existing = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!existing) throw new Error('Soort artikel niet gevonden');

  /*
   * §82: dit vergeleek tot nu toe met het **id** en niet met de slug.
   *
   * Voor elke soort die dit bestand zelf maakt is dat hetzelfde — `createType`
   * zet id en slug allebei op de slug, en de docblock hieronder zegt dan ook
   * dat `entry_types.id` *is* de slug. Sinds migratie `0028` is dat voor één
   * rij niet waar: de soort *Huisraad* kwam binnen als `id = 'type-huisraad'`
   * met `slug = 'huisraad'`. Elke Opslaan op die soort stuurt zijn eigen slug
   * mee, viel daardoor door deze vergelijking heen, vond in de `taken`-lookup
   * **zichzelf**, en kreeg "Het adres is al van een andere soort" terug. Geen
   * enkel vinkje, veld of woord op die soort was te bewaren.
   *
   * Twee reparaties, allebei nodig: vergelijk met de slug die er staat, en
   * laat de lookup de rij zelf niet meetellen. De tweede is de echte vangrail —
   * die beschermt ook de volgende soort waarvan het id en de slug uit elkaar
   * lopen, hoe die ook ontstaat.
   */
  if (next === existing.slug) return typeId;

  const taken = db
    .select({ id: schema.entryTypes.id })
    .from(schema.entryTypes)
    .where(and(eq(schema.entryTypes.slug, next), ne(schema.entryTypes.id, typeId)))
    .get();
  if (taken) throw new Error(`Het adres “${next}” is al van een andere soort.`);

  // One rename at a time. Two of them crossing would leave the second one
  // rewriting `ofType` values the first had already moved.
  if (renaming) throw new Error('Er wordt al een adres gewijzigd. Probeer het zo opnieuw.');
  renaming = true;
  try {
    db.transaction((tx) => {
      tx.update(schema.entryTypes)
        .set({ id: next, slug: next })
        .where(eq(schema.entryTypes.id, typeId))
        .run();
      tx.update(schema.entries)
        .set({ typeId: next })
        .where(eq(schema.entries.typeId, typeId))
        .run();

      // §7: a dossier may pin its own row of tabs, and it pins them by slug.
      // A stale one would simply stop drawing a tab — quietly, which is the
      // worst way for a tab full of artikelen to go.
      for (const row of tx
        .select({ id: schema.cases.id, tabTypes: schema.cases.tabTypes })
        .from(schema.cases)
        .all()) {
        if (!row.tabTypes?.includes(typeId)) continue;
        tx.update(schema.cases)
          .set({ tabTypes: row.tabTypes.map((slug) => (slug === typeId ? next : slug)) })
          .where(eq(schema.cases.id, row.id))
          .run();
      }

      // Every soort, not only this one: an `ofType` naming this soort can sit
      // on any of them.
      for (const row of tx.select().from(schema.entryTypes).all()) {
        const fields = renameInFields(row.fields, typeId, next);
        const blocks = renameInBlocks(row.blocks, typeId, next);
        if (!fields && !blocks) continue;
        const values: { fields?: FieldDef[]; blocks?: PageBlock[] } = {};
        if (fields) values.fields = fields;
        if (blocks) values.blocks = blocks;
        tx.update(schema.entryTypes).set(values).where(eq(schema.entryTypes.id, row.id)).run();
      }
    });
  } finally {
    renaming = false;
  }

  logAudit({
    actorId: keeperId,
    action: 'entry_type.renamed',
    targetType: 'entry_type',
    targetId: next,
    meta: { from: typeId, to: next, label: existing.label },
  });
  // The seed writes the shipped soorten with `INSERT OR IGNORE` keyed on the
  // slug, so without this marker the next restart would happily insert a fresh,
  // empty `object` beside the Keeper's `relieken`. Same trick `seedBaseline`
  // uses for the words it must not overwrite.
  markSlugRenamed(typeId);
  return next;
}

/** `ofType` on this soort's fields, rewritten — or null when none of them named it. */
function renameInFields(fields: FieldDef[] | null, from: string, to: string): FieldDef[] | null {
  let touched = false;
  const next = (fields ?? []).map((field) => {
    if (!field.ofType?.includes(from)) return field;
    touched = true;
    return { ...field, ofType: field.ofType.map((slug) => (slug === from ? to : slug)) };
  });
  return touched ? next : null;
}

/** The same for a page's blocks, which point at soorten in two ways. */
function renameInBlocks(blocks: PageBlock[] | null, from: string, to: string): PageBlock[] | null {
  let touched = false;
  const next = (blocks ?? []).map((block) => {
    const out = { ...block };
    if (block.ofType?.includes(from)) {
      out.ofType = block.ofType.map((slug) => (slug === from ? to : slug));
      touched = true;
    }
    if (block.fromType?.includes(from)) {
      out.fromType = block.fromType.map((slug) => (slug === from ? to : slug));
      touched = true;
    }
    return out;
  });
  return touched ? next : null;
}

/**
 * Remembers, in the one table the seed already consults, that a shipped slug is
 * not missing but *renamed*. `seedBaseline` reads these and leaves that soort
 * alone for good.
 */
function markSlugRenamed(oldSlug: string) {
  sqlite
    .prepare('INSERT OR IGNORE INTO schema_migrations (name) VALUES (?)')
    .run(`seed:type-renamed:${oldSlug}`);
}

export function createType(
  input: { label: string; icon?: string; colour?: string; border?: string },
  keeperId: string,
): string {
  const label = input.label.trim().slice(0, 60);
  if (!label) throw new Error('Geef de soort eerst een naam.');

  const base = slugify(label) || 'soort';
  const taken = new Set(
    db
      .select({ slug: schema.entryTypes.slug })
      .from(schema.entryTypes)
      .all()
      .map((row) => row.slug),
  );
  // §75: and never one of the wiki's own addresses.
  for (const reserved of RESERVED_WIKI_SLUGS) taken.add(reserved);
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const last = db
    .select({ sortOrder: schema.entryTypes.sortOrder })
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all()
    .at(-1);

  db.insert(schema.entryTypes)
    .values({
      id: slug,
      slug,
      label,
      icon: input.icon?.trim() || 'file',
      colour: /^#[0-9a-fA-F]{6}$/.test(input.colour ?? '') ? input.colour! : '#5C544A',
      border: input.border || 'plain',
      fields: [],
      blocks: [],
      pageText: {},
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .run();

  logAudit({
    actorId: keeperId,
    action: 'entry_type.created',
    targetType: 'entry_type',
    targetId: slug,
    meta: { label },
  });
  return slug;
}

/**
 * §24: the loose ends. §49: every artikel that has been told to wear a
 * dossier's name in front of its own and is in no dossier at all.
 *
 * A clue is *found*, during an investigation, so one with no investigation
 * behind it is a row nobody can explain — it happens anyway: the last dossier
 * holding it is emptied, or a dossier is destroyed from the bin and its
 * artikelen survive it (rule 21). The wiki marks each one where it lists it;
 * this is the same set gathered in one place, so a Keeper can file them again
 * instead of finding them one at a time.
 *
 * Keeper-only, like everything else on this page, so it is deliberately not
 * behind `visibleEntryCondition`: a Keeper sees the whole archive by that rule
 * anyway, and this list would be a lie if it left anything out.
 */
export type AdriftEntry = { id: string; slug: string; name: string; typeLabel: string };

export function listAdriftEntries(limit = 200): AdriftEntry[] {
  return db
    .select({
      id: schema.entries.id,
      slug: schema.entries.slug,
      name: schema.entries.name,
      typeLabel: schema.entryTypes.label,
    })
    .from(schema.entries)
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .where(
      and(
        eq(schema.entries.casePrefix, true),
        isNull(schema.entries.originCaseId),
        isNull(schema.entries.deletedAt),
      ),
    )
    .orderBy(asc(schema.entries.name))
    .limit(limit)
    .all();
}

/**
 * A type with entries filed under it cannot be removed — the entries would have
 * nothing to be. §16 says fewer options, so there is no "move them all" flow:
 * refile them first, and the button says so.
 */
export function deleteType(typeId: string, keeperId: string) {
  const inUse = db.select().from(schema.entries).where(eq(schema.entries.typeId, typeId)).all();
  if (inUse.length) throw new Error('Er staan nog artikelen onder deze soort.');
  db.delete(schema.entryTypes).where(eq(schema.entryTypes.id, typeId)).run();
  logAudit({
    actorId: keeperId,
    action: 'entry_type.deleted',
    targetType: 'entry_type',
    targetId: typeId,
  });
}
