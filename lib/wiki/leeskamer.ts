import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { CoverCrops } from '@/lib/images/shapes';
import { attributed } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { nameTheirCases, SUMMARY_COLUMNS, type EntrySummary } from '@/lib/entries/service';
import { entryDisplayName } from '@/lib/entries/caseName';
import { resolveHandles } from '@/lib/entries/shortRefs';
import { handlesIn } from '@/lib/entries/shortTokens.mjs';
import { projectForSnippet } from './snippet';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { sideCondition } from '@/lib/keeper/side';

/**
 * §104, ronde 67 — *De leeskamer*: wat de voorpagina van de wiki leest.
 *
 * Nick: vaste blokken onder het overzicht van de Keeper, ja. Het overzicht blijft
 * van de Keeper (§75/§87); deze drie blokken lezen het archief, en ze zijn alle
 * drie een **lijst** in de zin van §46: `visibleEntryCondition` (rule 1) en
 * daarna `sideCondition`, zodat een Keeper op zijn eigen kant alleen zijn eigen
 * dingen ziet en een speler nooit iets dat hij niet mag zien.
 *
 *  - *Onlangs bijgewerkt*: de nieuwste versie per artikel (`entry_revisions`),
 *    met het karakter dat die versie schreef (§11/§18b) en voor een speler
 *    zonder Keeper-tijdperk (§89/§65) — dezelfde bron als de regel
 *    *Bijgewerkt door* op het artikel zelf, zodat de twee nooit iets anders
 *    zeggen.
 *  - *Uit het archief* en `/wiki/willekeurig`: één willekeurig artikel, door
 *    `randomEntry` en niets anders.
 *  - *De soorten* leest `countEntriesPerType`, dezelfde telling als de tabs.
 */

/**
 * §89: was this version written while the artikel was the Keeper's alone? The
 * same `IS NOT` as `listRevisions` in `lib/entries/service.ts` (a snapshot from
 * before `visibility` was recorded counts as the table's), and
 * `tests/unit/ronde-67-leeskamer.test.ts` holds the two to the same answer.
 */
const notKeeperEpoch = sql`json_extract(${schema.entryRevisions.snapshot}, '$.visibility') IS NOT 'keeper'`;

export type RecentCard = {
  id: string;
  slug: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  coverAssetId: string | null;
  coverCrop: CoverCrops | null;
  visibility: EntrySummary['visibility'];
  /** The onderzoeker the version recorded, or the account's fallback (§11). */
  by: string | null;
  /** The account, for the tooltip. */
  account: string | null;
  at: number;
  /** Worded on the server, so the page does not reword it while hydrating. */
  when: string;
};

/**
 * *Onlangs bijgewerkt*: the `limit` artikelen whose newest version this reader
 * may see is newest, one row per artikel.
 */
export function recentlyUpdated(viewer: Viewer, limit = 6, now = Date.now()): RecentCard[] {
  if (!viewer) return [];
  // SQLite: with `max()` in a grouped select, the bare columns come from the row that holds the max.
  const rows = db
    .select({
      ...SUMMARY_COLUMNS,
      at: sql<number>`max(${schema.entryRevisions.createdAt})`,
      editedBy: schema.entryRevisions.editedBy,
      characterId: schema.entryRevisions.characterId,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
    })
    .from(schema.entryRevisions)
    .innerJoin(schema.entries, eq(schema.entries.id, schema.entryRevisions.entryId))
    .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
    .leftJoin(schema.users, eq(schema.users.id, schema.entryRevisions.editedBy))
    .where(
      and(
        visibleEntryCondition(viewer),
        // §46: a list, so the side the reader stands on.
        sideCondition('entry', viewer),
        ...(viewer.isKeeper ? [] : [notKeeperEpoch]),
      ),
    )
    .groupBy(schema.entryRevisions.entryId)
    .orderBy(desc(sql`max(${schema.entryRevisions.createdAt})`), desc(schema.entries.id))
    .limit(limit)
    .all();

  const named = attributed(
    nameTheirCases(
      rows.map((row) => ({
        ...row,
        actorId: row.editedBy,
        actorName: row.username,
        actorIsKeeper: Boolean(row.isKeeper),
      })),
      viewer,
    ),
  );
  return named.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: entryDisplayName(row.name, row.originCaseName),
    typeLabel: row.typeLabel,
    typeIcon: row.typeIcon,
    typeColour: row.typeColour,
    coverAssetId: row.coverAssetId,
    coverCrop: row.coverCrop,
    visibility: row.visibility,
    by: row.actorLabel ?? null,
    account: row.actorAccount ?? null,
    at: Number(row.at),
    when: relativeTime(Number(row.at), now),
  }));
}

/** One artikel, as *Uit het archief* draws it. Nothing in it the reader may not see. */
export type ArchiveCard = {
  id: string;
  slug: string;
  name: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  coverAssetId: string | null;
  coverCrop: CoverCrops | null;
  /**
   * The korte beschrijving as this reader reads it (`plainShort`): a chip is
   * the name they may see, or nothing — never a handle, never a hidden name.
   */
  lead: string;
};

/**
 * §104 (L2): one artikel at random, from what this reader may see, on the side
 * they stand on. The only chooser: `/wiki/willekeurig`, *Verras me* in the
 * palette and *Nog één* on the wiki all ask this.
 *
 * `not` leaves the one on screen out, so *Nog één* never answers with the same
 * page — unless it is the only one there is.
 */
export function randomEntry(viewer: Viewer, not?: string | null): EntrySummary | null {
  if (!viewer) return null;
  const pick = (exclude: boolean) =>
    db
      .select(SUMMARY_COLUMNS)
      .from(schema.entries)
      .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
      .where(
        and(
          visibleEntryCondition(viewer),
          // §46: a list — this side only. §44: never the other one.
          sideCondition('entry', viewer),
          ...(exclude && not ? [sql`${schema.entries.id} <> ${not}`] : []),
        ),
      )
      .orderBy(sql`random()`)
      .limit(1)
      .get() as EntrySummary | undefined;
  return pick(true) ?? (not ? pick(false) : undefined) ?? null;
}

/** The card for one artikel, worded for this reader. */
export function archiveCard(viewer: Viewer, entry: EntrySummary | null): ArchiveCard | null {
  if (!entry) return null;
  const [named] = nameTheirCases([entry], viewer);
  return {
    id: entry.id,
    slug: entry.slug,
    name: entryDisplayName(named.name, named.originCaseName),
    typeSlug: entry.typeSlug,
    typeLabel: entry.typeLabel,
    typeIcon: entry.typeIcon,
    typeColour: entry.typeColour,
    coverAssetId: entry.coverAssetId,
    coverCrop: entry.coverCrop,
    lead: readShort(viewer, entry.shortDescription ?? ''),
  };
}

/**
 * A short text as this reader reads it, as letters: a chip is the name they
 * may see, or nothing — `plainShort`'s rule, with the gap before a full stop
 * closed as well (`projectForSnippet`), because this one is printed as a
 * sentence on its own.
 */
function readShort(viewer: Viewer, text: string): string {
  if (!text) return '';
  const chips = resolveHandles(viewer, handlesIn(text));
  return projectForSnippet(text, {
    isOwn: () => false,
    ownName: '',
    nameOf: (handle) => chips.get(handle)?.name ?? null,
  })
    .flat.replace(/\n+/g, ' ')
    .trim();
}
