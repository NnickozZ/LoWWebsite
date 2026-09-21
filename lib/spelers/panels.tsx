import type { ReactNode } from 'react';
import { and, inArray } from 'drizzle-orm';
import { BijdragenPanel } from '@/components/spelers/BijdragenPanel';
import { DossiersPanel } from '@/components/spelers/DossiersPanel';
import { KaraktersPanel, type KaraktersData } from '@/components/spelers/KaraktersPanel';
import { KamerPanel, type KamerPanelData } from '@/components/spelers/KamerPanel';
import { NuBezigPanel } from '@/components/spelers/NuBezigPanel';
import { listCases, type CaseSummary } from '@/lib/cases/service';
import { activeCharacter, listCharacters } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { recentActivity, type FeedItem } from '@/lib/entries/service';
import { visibleEntryCondition, type Viewer } from '@/lib/entries/visibility';
import { roomSummary } from '@/lib/kamers/service';
import { capitalise, type Words } from '@/lib/words';
import type { SpelerLite } from './service';

/**
 * §77: the panels of a spelerspagina.
 *
 * **A panel is a summary with a door.** It shows the smallest true thing — a
 * balance, three portraits, the last four lines — and links to the page that
 * owns it. Nothing on a panel is editable, and nothing lives in a panel that
 * has no page of its own.
 *
 * That rule is the whole design, and it is worth saying why. A person's front
 * door is the one screen in the archive that is tempted to become a second
 * copy of everything: a wardrobe you can switch from, a dossier list you can
 * file into, a feed you can reply to. Every one of those is a second road to a
 * fact, and two roads to one fact is two roads that can disagree (§66's reason
 * for `writeRelation`, one layer up). So a panel reads and points, and the
 * writing happens where it already happened before this page existed.
 *
 * The second half of the rule is the harder one to keep: *nothing lives in a
 * panel that has no page of its own*. A panel is not a place to put a feature
 * that was never built — which is exactly what §78's kamer would have been, so
 * its panel is one sentence and no furniture.
 *
 * ### Adding a panel
 *
 * One object in `SPELER_PANELS`, below. `definePanel` binds the loader to the
 * component so the array can hold panels whose data are different shapes
 * without any of them widening to `unknown`: `T` is inferred from `load`'s
 * return and checked against `Component`'s `data`.
 *
 * Every panel is rendered by the page inside the same frame with the same
 * `data-testid={`panel-${id}`}`, so a panel brings a title and a body and
 * never its own heading, its own card or its own spacing.
 */

export type PanelContext = {
  /** Who is reading. Every read inside `load` is that person's, never the subject's. */
  viewer: Viewer;
  /** Whose page this is. */
  speler: SpelerLite;
  /** §11: every visible string. */
  words: Words;
  /** Whether the reader is the subject — a door may point at `/you` only then. */
  isSelf: boolean;
};

export type Panel = {
  id: string;
  title: (words: Words) => string;
  /**
   * The panel's own read, with its result type erased so that panels of
   * different shapes fit in one array. The page never calls this — `render`
   * does, and hands the answer straight to the component that asked for it —
   * but a test may, which is why it is on the type at all.
   */
  load: (viewer: Viewer, speler: SpelerLite) => unknown;
  render: (ctx: PanelContext) => ReactNode;
};

export function definePanel<T>(def: {
  id: string;
  title: (words: Words) => string;
  load: (viewer: Viewer, speler: SpelerLite) => T;
  Component: (props: PanelContext & { data: T }) => ReactNode;
}): Panel {
  const { id, title, load, Component } = def;
  return {
    id,
    title,
    load,
    render: (ctx) => <Component {...ctx} data={load(ctx.viewer, ctx.speler)} />,
  };
}

/**
 * §9/§17: the fiches this account holds, narrowed to the ones the *reader* may
 * see. `listCharacters` asks the subject's own eyes — it is written for the
 * wardrobe, where the subject is the reader — so on somebody else's page it
 * has to be narrowed again. This only ever takes rows away.
 */
function charactersVisibleTo(viewer: Viewer, speler: SpelerLite): KaraktersData {
  if (speler.isKeeper) return { characters: [], activeId: null };
  const held = listCharacters(speler.id);
  if (held.length === 0) return { characters: [], activeId: null };
  const seen = new Set(
    db
      .select({ id: schema.entries.id })
      .from(schema.entries)
      .where(
        and(
          inArray(
            schema.entries.id,
            held.map((character) => character.entryId),
          ),
          visibleEntryCondition(viewer),
        ),
      )
      .all()
      .map((row) => row.id),
  );
  return {
    characters: held.filter((character) => seen.has(character.entryId)),
    activeId: activeCharacter(speler.id)?.entryId ?? null,
  };
}

/**
 * §79: the kamers behind this account's fiches, as far as the *reader* may see
 * them.
 *
 * One line per onderzoeker, because a kamer belongs to an onderzoeker and not
 * to an account (§17/§18). `roomSummary` asks `canSeeRoom`, which is the
 * karakter's own visibility plus the kamer's dial, and hands back null when the
 * answer is no — so a fiche the reader may not see contributes no line, exactly
 * as it contributes no portrait two panels up. A Keeper wears nobody, so their
 * own page has no lines at all and needs no special case for it.
 */
function kamersOf(viewer: Viewer, speler: SpelerLite): KamerPanelData {
  return {
    rooms: listCharacters(speler.id).flatMap((character) => {
      const summary = roomSummary(character.entryId, viewer);
      return summary ? [{ entryId: character.entryId, name: character.name, ...summary }] : [];
    }),
  };
}

/**
 * How far back the feed is read before it is narrowed to one actor. The Start
 * shows thirty of everybody's; one person's last six are somewhere inside the
 * last couple of hundred or they are not recent enough to be called recent.
 */
const FEED_SCAN = 200;
const FEED_SHOWN = 6;

function contributionsOf(viewer: Viewer, speler: SpelerLite): FeedItem[] {
  // The Start's own feed, unchanged: §9, §17 and §46 are already in it, and a
  // query of our own here would be a second set of rules to keep in step.
  return recentActivity(viewer, FEED_SCAN)
    .filter((item) => item.actorId === speler.id && item.entry)
    .slice(0, FEED_SHOWN);
}

/**
 * Dossiers this person is on that the reader may also open. `memberOf` is the
 * subject's half; `visibleCaseCondition`, inside `listCases`, is the reader's.
 */
function casesShared(viewer: Viewer, speler: SpelerLite): CaseSummary[] {
  return listCases(viewer, { memberOf: speler.id, sort: 'status' }).slice(0, 6);
}

/**
 * §85: **the order is the answer to "what is this person to me".**
 *
 * It was presence, karakters, kamer, bijdragen, dossiers — which is the order
 * the panels were built in, one per round, and nothing else. What that put
 * first was the line that is empty most of the time (nobody is online) and
 * what it put last was the two that are almost always full.
 *
 * The kamer goes first because it is the one panel that is *about* something
 * that accumulates: it says what this person has, and since §84 it has a
 * number on it that moves. Karakters second because a kamer belongs to an
 * onderzoeker and the next question is which one. Presence third, where a line
 * that is usually empty costs nothing. Then dossiers and the contributions,
 * both of which are lists you scan rather than facts you read.
 */
export const SPELER_PANELS: Panel[] = [
  definePanel({
    id: 'kamer',
    title: (words) => capitalise(words.room),
    // §79: one line per onderzoeker this account wears. Reserved under §78,
    // filled in now that the kamer has a page of its own to point at.
    load: kamersOf,
    Component: ({ data, words }) => <KamerPanel data={data} words={words} />,
  }),
  definePanel({
    id: 'karakters',
    title: (words) => capitalise(words.characterPlural),
    load: charactersVisibleTo,
    Component: ({ data, speler, words, isSelf }) => (
      <KaraktersPanel data={data} speler={speler} words={words} isSelf={isSelf} />
    ),
  }),
  definePanel({
    id: 'nu-bezig',
    title: (words) => words.presence,
    // Nothing to load: presence is the live line's, not the database's.
    load: () => null,
    Component: ({ speler, words }) => <NuBezigPanel speler={speler} words={words} />,
  }),
  definePanel({
    id: 'dossiers',
    title: (words) => capitalise(words.casePlural),
    load: casesShared,
    Component: ({ data, speler, words }) => (
      <DossiersPanel cases={data} speler={speler} words={words} />
    ),
  }),
  definePanel({
    id: 'bijdragen',
    // §11 has no word for this yet; a plain Dutch heading rather than a new key.
    title: () => 'Recente bijdragen',
    load: contributionsOf,
    Component: ({ data, viewer, words }) => <BijdragenPanel rows={data} viewer={viewer} words={words} />,
  }),
];
