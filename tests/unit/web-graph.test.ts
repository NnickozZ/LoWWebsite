import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WebEdgeKind, WebGraph } from '@/lib/web/types';
import { EDGE_KIND_ORDER } from '@/lib/web/kinds';

/**
 * §43: the web, built for one viewer from a real database.
 *
 * Two claims are the whole of it, and both need every table filled in:
 *
 *  1. Every kind of tie the archive knows appears, drawn from the table it
 *     lives in, with the detail the panel prints.
 *  2. **A node the viewer may not open is absent, and so is every edge that
 *     touches it.** Not dimmed, not stamped — absent. The graph is closed: no
 *     edge in it names a node that is not in it. That is rule 1, and it is
 *     checked for the whole graph in one line (`assertClosed`) as well as for
 *     the specific things a player must not learn exist.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-web-graph-'));
process.env.DATA_DIR = dir;

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  buildWebGraph: typeof import('@/lib/web/service').buildWebGraph;
  caseLinksInFields: typeof import('@/lib/web/service').caseLinksInFields;
  noteName: typeof import('@/lib/web/service').noteName;
  rebuildAllMentions: typeof import('@/lib/entries/mentions').rebuildAllMentions;
  recomputeMentions: typeof import('@/lib/entries/mentions').recomputeMentions;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

/** A body document with one entryLink in it — what `@` and `[[` produce. */
const linking = (id: string, label: string) =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Zie ook ' },
          { type: 'entryLink', attrs: { id, label } },
        ],
      },
    ],
  });

const card = (id: string, over: Record<string, unknown>) => ({
  id,
  kind: 'entry',
  name: '',
  text: '',
  showImage: true,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  ...over,
});

/** No edge may name a node that is not in the graph. */
function assertClosed(graph: WebGraph) {
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    expect(ids.has(edge.from), `edge ${edge.id} leaves the graph at its from`).toBe(true);
    expect(ids.has(edge.to), `edge ${edge.id} leaves the graph at its to`).toBe(true);
    if (edge.via) expect(ids.has(edge.via), `edge ${edge.id} hangs on a missing prikbord`).toBe(true);
  }
}

const edgesOf = (graph: WebGraph, kind: WebEdgeKind) => graph.edges.filter((edge) => edge.kind === kind);
const hasEdge = (graph: WebGraph, kind: WebEdgeKind, from: string, to: string, detail?: string) =>
  graph.edges.some(
    (edge) => edge.kind === kind && edge.from === from && edge.to === to && (detail === undefined || edge.detail === detail),
  );
const touching = (graph: WebGraph, id: string) =>
  graph.edges.filter((edge) => edge.from === id || edge.to === id || edge.via === id);

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const service = await import('@/lib/web/service');
  const mentions = await import('@/lib/entries/mentions');
  deps = {
    sqlite: dbModule.sqlite,
    buildWebGraph: service.buildWebGraph,
    caseLinksInFields: service.caseLinksInFields,
    noteName: service.noteName,
    rebuildAllMentions: mentions.rebuildAllMentions,
    recomputeMentions: mentions.recomputeMentions,
  };
  const { sqlite } = deps;
  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
    ['aagje', 'Aagje', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper) VALUES (?, ?, ?, 'x', 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }

  // A soort of our own with a dossier field in the infobox.
  run(
    `INSERT INTO entry_types (id, slug, label, fields, blocks, sort_order) VALUES ('proef', 'proef', 'Proef', ?, '[]', 900)`,
    JSON.stringify([{ key: 'zaak', label: 'Hoort bij', kind: 'case_link' }]),
  );

  const entry = (id: string, typeId: string, name: string, over: { visibility?: string; fields?: unknown } = {}) =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, created_by, visibility) VALUES (?, ?, ?, ?, ?, '[]', 'keeper-1', ?)`,
      id,
      typeId,
      name,
      id,
      JSON.stringify(over.fields ?? {}),
      over.visibility ?? 'all',
    );
  entry('e-jan', 'character', 'Jan Vermeer');
  entry('e-toren', 'location', 'De Vuurtoren');
  entry('e-plek', 'location', 'Walcheren');
  entry('e-journaal', 'object', 'Het scheepsjournaal', {
    fields: { current_holder: { id: 'e-jan', name: 'Jan Vermeer', slug: 'e-jan' } },
  });
  entry('e-inv', 'investigator', 'Onderzoeker Van Dijk', { fields: { player: { id: 'bram', username: 'Bram' } } });
  entry('e-proef', 'proef', 'Proefstuk', { fields: { zaak: 'c-open' } });
  entry('e-geheim', 'location', 'De geheime kelder', { visibility: 'keeper' });

  // Bram wears Jan; a second fiche too, to show every karakter a member holds counts.
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('bram', 'e-jan', 0)`);
  run(`INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES ('bram', 'e-inv', 1)`);

  // What the bodies say.
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-toren', 'e-jan', 'mention', '')`);
  // Round 18: a text line yields to any other tie; this one has none to yield to.
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-plek', 'e-journaal', 'mention', '')`);
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-jan', 'e-journaal', 'relation', 'bezit')`);
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-geheim', 'e-jan', 'mention', '')`);
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('e-jan', 'e-geheim', 'mention', '')`);

  // Two sections on the journaal: one still prep, one everyone has.
  run(
    `INSERT INTO entry_sections (id, entry_id, title, body, body_text, visibility, sort_order) VALUES ('s-prep', 'e-journaal', 'Wat de dokter wist', ?, '', 'keeper', 0)`,
    linking('e-plek', 'Walcheren'),
  );
  run(
    `INSERT INTO entry_sections (id, entry_id, title, body, body_text, visibility, sort_order) VALUES ('s-open', 'e-journaal', 'Openbaar', ?, '', 'all', 1)`,
    linking('e-plek', 'Walcheren'),
  );

  // Dossiers: one open, one Aagje's alone.
  run(
    `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-open', 'Zaak Vlissingen', 'zaak-vlissingen', 'open', 'bram', 'all')`,
  );
  run(
    `INSERT INTO cases (id, name, slug, status, created_by, view_mode) VALUES ('c-prive', 'De brand van 1934', 'de-brand', 'open', 'aagje', 'private')`,
  );
  run(`INSERT INTO case_entries (case_id, entry_id, added_by) VALUES ('c-open', 'e-toren', 'bram')`);
  run(`INSERT INTO case_entries (case_id, entry_id, added_by) VALUES ('c-open', 'e-geheim', 'keeper-1')`);
  run(`INSERT INTO case_entries (case_id, entry_id, added_by) VALUES ('c-prive', 'e-jan', 'aagje')`);
  run(
    `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('case', 'c-open', 'bram', 1, 0)`,
  );

  // Landkaarten: the island (of Walcheren), and one Aagje keeps to herself.
  run(
    `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, entry_id) VALUES ('m-eiland', 'Eiland', 'eiland', 'a1', 10, 10, 0, 'keeper-1', 'e-plek')`,
  );
  run(
    `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode) VALUES ('m-geheim', 'Het huis', 'het-huis', 'a2', 10, 10, 1, 'aagje', 'private')`,
  );
  run(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y, created_by) VALUES ('p-jan', 'm-eiland', 'entry', 'e-jan', 0.5, 0.5, 'bram')`);
  run(`INSERT INTO map_pins (id, map_id, kind, entry_id, x, y, created_by) VALUES ('p-geheim', 'm-eiland', 'entry', 'e-geheim', 0.2, 0.2, 'keeper-1')`);
  run(`INSERT INTO map_pins (id, map_id, kind, target_map_id, x, y, created_by) VALUES ('p-huis', 'm-eiland', 'map', 'm-geheim', 0.3, 0.3, 'aagje')`);
  run(
    `INSERT INTO map_pins (id, map_id, kind, name, text, x, y, created_by) VALUES ('p-boot', 'm-eiland', 'note', 'Hier lag de boot', 'van @Jan Vermeer', 0.7, 0.7, 'aagje')`,
  );

  // A tijdlijn inside the open dossier.
  run(
    `INSERT INTO timelines (id, name, slug, scale, case_id, created_by) VALUES ('t-week', 'De week', 'de-week', 'day', 'c-open', 'bram')`,
  );
  run(
    `INSERT INTO timeline_events (id, timeline_id, kind, entry_id, at, precision, created_by) VALUES ('ev-toren', 't-week', 'entry', 'e-toren', 0, 'day', 'bram')`,
  );
  run(
    `INSERT INTO timeline_events (id, timeline_id, kind, entry_id, at, precision, created_by) VALUES ('ev-geheim', 't-week', 'entry', 'e-geheim', 0, 'day', 'keeper-1')`,
  );
  run(
    `INSERT INTO timeline_events (id, timeline_id, kind, name, text, at, precision, created_by) VALUES ('ev-brand', 't-week', 'note', 'De brand', 'met [[Jan Vermeer]]', 86400, 'day', 'bram')`,
  );

  // Prikborden: the open wall in the open dossier, and Aagje's private one.
  run(
    `INSERT INTO boards (id, name, case_id, state, created_by, view_mode) VALUES ('b-open', 'De muur', 'c-open', ?, 'bram', 'all')`,
    JSON.stringify({
      cards: [
        card('card-jan', { kind: 'entry', entryId: 'e-jan', name: 'Jan Vermeer' }),
        card('card-toren', { kind: 'entry', entryId: 'e-toren', name: 'De Vuurtoren' }),
        card('card-geheim', { kind: 'entry', entryId: 'e-geheim', name: 'De geheime kelder' }),
        card('card-map', { kind: 'map', mapId: 'm-eiland', name: 'Eiland' }),
        card('card-huis', { kind: 'map', mapId: 'm-geheim', name: 'Het huis' }),
        card('card-case', { kind: 'case', caseId: 'c-open', name: 'Zaak Vlissingen' }),
        card('card-tl', { kind: 'timeline', timelineId: 't-week', name: 'De week' }),
        card('card-note', { kind: 'note', name: 'Wie had de sleutel?', text: 'Volgens de havenmeester was [[Jan Vermeer]] er.' }),
        card('card-naamloos', { kind: 'note', name: '', text: 'Een notitie zonder naam maar met een heel lange tekst erin.' }),
        card('card-leeg', { kind: 'note', name: '', text: '' }),
        card('card-pin', { kind: 'pin', name: 'Lead' }),
        card('card-pin-kaal', { kind: 'pin', name: '' }),
      ],
      strings: [
        { id: 'st-1', from: { card: 'card-jan' }, to: { card: 'card-toren' }, label: 'zag', colour: 'blue' },
        { id: 'st-2', from: { card: 'card-note' }, to: { card: 'card-jan' }, label: '' },
        { id: 'st-3', from: { card: 'card-jan' }, to: { card: 'card-geheim' }, label: 'kende' },
        { id: 'st-4', from: { card: 'card-jan' }, to: { x: 10, y: 10 }, label: 'los' },
        { id: 'st-5', from: { card: 'card-jan' }, to: { card: 'card-pin' }, label: 'punaise' },
        { id: 'st-6', from: { card: 'card-pin-kaal' }, to: { card: 'card-toren' }, label: 'kaal' },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  );
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode) VALUES ('b-prive', 'Aagjes muur', ?, 'aagje', 'private')`,
    JSON.stringify({
      cards: [card('card-jan-2', { kind: 'entry', entryId: 'e-jan', name: 'Jan Vermeer' })],
      strings: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  );

  // Round 18: a wall its manager keeps out of the web — open to all, and
  // still it is not a knot, a line or a "Genoemd in".
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode, in_web) VALUES ('b-uit', 'Een hunch', ?, 'bram', 'all', 0)`,
    JSON.stringify({
      cards: [
        card('card-plek-uit', { kind: 'entry', entryId: 'e-plek', name: 'Walcheren' }),
        card('card-toren-uit', { kind: 'entry', entryId: 'e-toren', name: 'De Vuurtoren' }),
      ],
      strings: [{ id: 'st-uit', from: { card: 'card-plek-uit' }, to: { card: 'card-toren-uit' }, label: 'heeft gezien' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    }),
  );

  // The panel's short description: one of each kind that has one, padded to
  // show it is trimmed; the rest stay empty and must come through as absent.
  run(`UPDATE entries SET short_description = '  Een oude toren aan zee.  ' WHERE id = 'e-toren'`);
  run(`UPDATE cases SET summary = 'Wat er in Vlissingen gebeurde.' WHERE id = 'c-open'`);
  run(`UPDATE maps SET description = 'Het eiland, getekend.' WHERE id = 'm-eiland'`);
  run(`UPDATE timelines SET description = 'Zeven dagen.' WHERE id = 't-week'`);

  // §27: the derived table, from every source at once; the dossier's notes by hand.
  deps.rebuildAllMentions();
  deps.recomputeMentions('case', 'c-open', [{ toEntryId: 'e-jan' }]);
  deps.recomputeMentions('case', 'c-prive', [{ toEntryId: 'e-toren' }]);
});

afterAll(() => {
  deps?.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the Keeper sees every kind of tie', () => {
  let graph: WebGraph;
  beforeAll(() => {
    // Round 18: the Keeper's web leaves other people's private things out
    // unless asked; this suite asks, so every kind of tie is here to check.
    graph = deps.buildWebGraph(KEEPER, { othersPrivate: true });
  });

  it('is closed: no edge leaves the graph', () => {
    assertClosed(graph);
  });

  it("without asking, the Keeper's web leaves other people's private things out — and keeps the Keeper's own hidden pages (round 18)", () => {
    const plain = deps.buildWebGraph(KEEPER);
    assertClosed(plain);
    // Aagje's private dossier and wall: not a knot, not a line, not a name.
    expect(plain.nodes.some((node) => node.id === 'case:c-prive' || node.id === 'board:b-prive')).toBe(false);
    expect(JSON.stringify(plain)).not.toContain('Aagjes muur');
    expect(JSON.stringify(plain)).not.toContain('De brand van 1934');
    // Landkaart m-geheim is private to its maker (a Keeper is not its maker here): out too.
    expect(plain.nodes.some((node) => node.id === 'map:m-geheim')).toBe(false);
    // The Keeper-only artikel is the Keeper's own secret and stays.
    expect(plain.nodes.some((node) => node.id === 'entry:e-geheim')).toBe(true);
    // Everything open is exactly as before.
    expect(hasEdge(plain, 'filed', 'case:c-open', 'entry:e-toren')).toBe(true);
    expect(hasEdge(plain, 'thread', 'entry:e-jan', 'entry:e-toren', 'zag')).toBe(true);
    // A player's web never had them, asked or not.
    const bram = deps.buildWebGraph(BRAM, { othersPrivate: true });
    expect(bram.nodes.some((node) => node.id === 'case:c-prive' || node.id === 'board:b-prive')).toBe(false);
  });

  it('every edge kind appears at least once', () => {
    const kinds = new Set(graph.edges.map((edge) => edge.kind));
    for (const kind of EDGE_KIND_ORDER) expect(kinds.has(kind), `no ${kind} edge`).toBe(true);
  });

  it('what a body says: mention and relation, with the label', () => {
    expect(hasEdge(graph, 'mention', 'entry:e-plek', 'entry:e-journaal', '')).toBe(true);
    expect(hasEdge(graph, 'relation', 'entry:e-jan', 'entry:e-journaal', 'bezit')).toBe(true);
    // Round 18: the toren's text names Jan, but a draad already ties the two
    // — the text line yields (slice.ts, collapseMentions).
    expect(hasEdge(graph, 'thread', 'entry:e-jan', 'entry:e-toren', 'zag')).toBe(true);
    expect(hasEdge(graph, 'mention', 'entry:e-toren', 'entry:e-jan', '')).toBe(false);
  });

  it('what the infobox says: a field, a dossier, a player', () => {
    expect(hasEdge(graph, 'field', 'entry:e-journaal', 'entry:e-jan', 'Huidige houder')).toBe(true);
    expect(hasEdge(graph, 'caseLink', 'entry:e-proef', 'case:c-open', 'Hoort bij')).toBe(true);
    // The player field names Bram, who is drawn as the karakters he holds —
    // both of them, not only the one he is wearing. His own fiche is skipped
    // as a self-loop.
    expect(hasEdge(graph, 'player', 'entry:e-inv', 'entry:e-jan', 'Speler')).toBe(true);
    expect(hasEdge(graph, 'player', 'entry:e-inv', 'entry:e-inv')).toBe(false);
  });

  it('what a section says, with its title', () => {
    expect(hasEdge(graph, 'section', 'entry:e-journaal', 'entry:e-plek', 'Wat de dokter wist')).toBe(true);
    expect(hasEdge(graph, 'section', 'entry:e-journaal', 'entry:e-plek', 'Openbaar')).toBe(true);
  });

  it('what a dossier holds, says, and hangs', () => {
    expect(hasEdge(graph, 'filed', 'case:c-open', 'entry:e-toren')).toBe(true);
    expect(hasEdge(graph, 'filed', 'case:c-prive', 'entry:e-jan')).toBe(true);
    expect(hasEdge(graph, 'caseNotes', 'case:c-open', 'entry:e-jan', '')).toBe(true);
    expect(hasEdge(graph, 'inCase', 'case:c-open', 'board:b-open')).toBe(true);
    expect(hasEdge(graph, 'inCase', 'case:c-open', 'timeline:t-week')).toBe(true);
    expect(hasEdge(graph, 'investigator', 'entry:e-jan', 'case:c-open')).toBe(true);
    expect(hasEdge(graph, 'investigator', 'entry:e-inv', 'case:c-open')).toBe(true);
  });

  it('what a prikbord shows: a card of each kind, and a notitie that writes a name down', () => {
    expect(hasEdge(graph, 'board', 'board:b-open', 'entry:e-jan')).toBe(true);
    expect(hasEdge(graph, 'board', 'board:b-open', 'map:m-eiland')).toBe(true);
    expect(hasEdge(graph, 'board', 'board:b-open', 'case:c-open')).toBe(true);
    expect(hasEdge(graph, 'board', 'board:b-open', 'timeline:t-week')).toBe(true);
    expect(hasEdge(graph, 'boardNote', 'board:b-open', 'entry:e-jan', 'Wie had de sleutel?')).toBe(true);
    // An entry card is a `board` edge, never also a `boardNote` with no detail.
    expect(edgesOf(graph, 'boardNote').every((edge) => edge.detail)).toBe(true);
  });

  it('a prikbord kept out of the web is not in it at all (round 18)', () => {
    expect(graph.nodes.some((node) => node.id === 'board:b-uit')).toBe(false);
    expect(graph.edges.some((edge) => edge.from === 'board:b-uit' || edge.to === 'board:b-uit' || edge.via === 'board:b-uit')).toBe(false);
    expect(hasEdge(graph, 'thread', 'entry:e-plek', 'entry:e-toren', 'heeft gezien')).toBe(false);
    expect(JSON.stringify(graph)).not.toContain('Een hunch');
  });

  it('a draad between two cards becomes a thread, hung on its prikbord', () => {
    const thread = edgesOf(graph, 'thread').find((edge) => edge.detail === 'zag');
    expect(thread).toMatchObject({ from: 'entry:e-jan', to: 'entry:e-toren', via: 'board:b-open' });
    // Round 18: the draad brings its own colour along; one without a set
    // colour is the wall's default, red.
    expect(thread?.colour).toBe('blue');
    // A draad to a loose end resolves to nothing, and without notes on,
    // neither a draad to a notitie nor one to a punaise (§47).
    expect(edgesOf(graph, 'thread').map((edge) => edge.detail).sort()).toEqual(['kende', 'zag']);
  });

  it('what a landkaart shows: spelden, and the place it is a map of', () => {
    expect(hasEdge(graph, 'pin', 'map:m-eiland', 'entry:e-jan', '')).toBe(true);
    expect(hasEdge(graph, 'pin', 'map:m-eiland', 'map:m-geheim', '')).toBe(true);
    expect(hasEdge(graph, 'pin', 'map:m-eiland', 'entry:e-jan', 'Hier lag de boot')).toBe(true);
    expect(hasEdge(graph, 'mapOf', 'map:m-eiland', 'entry:e-plek')).toBe(true);
  });

  it('what a tijdlijn shows: a gebeurtenis with its moment, and a note that names somebody', () => {
    const event = edgesOf(graph, 'event').find((edge) => edge.to === 'entry:e-toren');
    expect(event?.from).toBe('timeline:t-week');
    expect(event?.detail).toMatch(/\d/);
    expect(hasEdge(graph, 'event', 'timeline:t-week', 'entry:e-jan', 'De brand')).toBe(true);
  });

  it('nodes carry what the panel prints', () => {
    const jan = graph.nodes.find((node) => node.id === 'entry:e-jan');
    expect(jan).toMatchObject({ kind: 'entry', refId: 'e-jan', href: '/e/e-jan', typeSlug: 'character', isCharacter: true });
    expect(jan?.subtitle).toBe(jan?.typeLabel);
    expect(graph.nodes.find((node) => node.id === 'entry:e-toren')?.isCharacter).toBe(false);
    expect(graph.nodes.find((node) => node.id === 'case:c-open')?.href).toBe('/c/zaak-vlissingen');
    expect(graph.nodes.find((node) => node.id === 'board:b-open')).toMatchObject({ href: '/b/b-open', subtitle: 'Zaak Vlissingen' });
    expect(graph.nodes.find((node) => node.id === 'map:m-eiland')).toMatchObject({ href: '/maps/eiland', subtitle: 'Walcheren' });
    expect(graph.nodes.find((node) => node.id === 'timeline:t-week')?.href).toBe('/timelines/de-week');
  });

  it('nodes carry the short description, trimmed, and none when there is none', () => {
    const by = (id: string) => graph.nodes.find((node) => node.id === id);
    expect(by('entry:e-toren')?.summary).toBe('Een oude toren aan zee.');
    expect(by('case:c-open')?.summary).toBe('Wat er in Vlissingen gebeurde.');
    expect(by('map:m-eiland')?.summary).toBe('Het eiland, getekend.');
    expect(by('timeline:t-week')?.summary).toBe('Zeven dagen.');
    expect(by('entry:e-jan')?.summary).toBeUndefined();
    expect(by('board:b-open')?.summary).toBeUndefined();
  });

  it('degree counts every edge touching the node, and ids are unique', () => {
    const ids = graph.edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const node of graph.nodes) {
      const n = graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
      expect(node.degree, node.id).toBe(n);
    }
    expect(graph.nodes.find((node) => node.id === 'entry:e-jan')!.degree).toBeGreaterThan(5);
  });

  it('draws no self-loop', () => {
    expect(graph.edges.some((edge) => edge.from === edge.to)).toBe(false);
  });

  it('has no notities unless asked', () => {
    expect(graph.nodes.some((node) => node.kind === 'note')).toBe(false);
  });
});

describe('rule 1: what a player may not open is absent', () => {
  let graph: WebGraph;
  beforeAll(() => {
    graph = deps.buildWebGraph(BRAM);
  });

  it('is closed', () => {
    assertClosed(graph);
  });

  it('a Keeper-only artikel is not a node, and nothing touches it', () => {
    expect(graph.nodes.some((node) => node.id === 'entry:e-geheim')).toBe(false);
    expect(touching(graph, 'entry:e-geheim')).toEqual([]);
    // Not the body that named it, not the dossier that filed it, not the
    // card, the speld, the gebeurtenis, nor the draad to its card.
    expect(JSON.stringify(graph)).not.toContain('e-geheim');
    expect(JSON.stringify(graph)).not.toContain('geheime kelder');
  });

  it('a private dossier is not a node, and nothing touches it', () => {
    expect(graph.nodes.some((node) => node.id === 'case:c-prive')).toBe(false);
    expect(touching(graph, 'case:c-prive')).toEqual([]);
    expect(JSON.stringify(graph)).not.toContain('brand van 1934');
  });

  it('a private landkaart and a private prikbord go the same way', () => {
    expect(graph.nodes.some((node) => node.id === 'map:m-geheim')).toBe(false);
    expect(graph.nodes.some((node) => node.id === 'board:b-prive')).toBe(false);
    expect(JSON.stringify(graph)).not.toContain('Het huis');
    expect(JSON.stringify(graph)).not.toContain('Aagjes muur');
    // The speld that pointed at the hidden map is gone with it.
    expect(edgesOf(graph, 'pin').some((edge) => edge.to === 'map:m-geheim')).toBe(false);
  });

  it('a section still in prep does not speak, a public one does', () => {
    expect(hasEdge(graph, 'section', 'entry:e-journaal', 'entry:e-plek', 'Wat de dokter wist')).toBe(false);
    expect(hasEdge(graph, 'section', 'entry:e-journaal', 'entry:e-plek', 'Openbaar')).toBe(true);
  });

  it('but everything he may open is still there, with the same ties', () => {
    expect(hasEdge(graph, 'thread', 'entry:e-jan', 'entry:e-toren', 'zag')).toBe(true);
    expect(hasEdge(graph, 'investigator', 'entry:e-jan', 'case:c-open')).toBe(true);
    expect(hasEdge(graph, 'filed', 'case:c-open', 'entry:e-toren')).toBe(true);
    expect(edgesOf(graph, 'thread').map((edge) => edge.detail)).toEqual(['zag']);
  });

  it('the owner of the private things sees them', () => {
    const hers = deps.buildWebGraph(AAGJE);
    assertClosed(hers);
    expect(hers.nodes.some((node) => node.id === 'case:c-prive')).toBe(true);
    expect(hers.nodes.some((node) => node.id === 'board:b-prive')).toBe(true);
    expect(hasEdge(hers, 'board', 'board:b-prive', 'entry:e-jan')).toBe(true);
    expect(hasEdge(hers, 'filed', 'case:c-prive', 'entry:e-jan')).toBe(true);
    // Still not the Keeper-only artikel, though.
    expect(hers.nodes.some((node) => node.id === 'entry:e-geheim')).toBe(false);
  });
});

describe('notities, when asked for', () => {
  let graph: WebGraph;
  beforeAll(() => {
    graph = deps.buildWebGraph(KEEPER, { notes: true });
  });

  it('is closed', () => {
    assertClosed(graph);
  });

  it('a notitie with a name or a text is a node; an empty one is not', () => {
    const note = graph.nodes.find((node) => node.id === 'note:card-note');
    expect(note).toMatchObject({ kind: 'note', refId: 'card-note', name: 'Wie had de sleutel?', href: '/b/b-open', subtitle: 'De muur' });
    const nameless = graph.nodes.find((node) => node.id === 'note:card-naamloos');
    expect(nameless?.name).toBe('Een notitie zonder naam maar met een hee…');
    expect(graph.nodes.some((node) => node.id === 'note:card-leeg')).toBe(false);
  });

  it('a draad to a notitie is a thread once the notitie is a node', () => {
    expect(hasEdge(graph, 'thread', 'note:card-note', 'entry:e-jan', '')).toBe(true);
    expect(edgesOf(graph, 'thread')).toHaveLength(5);
  });

  /*
   * §47: a punaise is a knot like a notitie, so the draad through it — the
   * ordinary way a lead with no artikel yet is tied to two things — is on the
   * web instead of being dropped on the floor.
   */
  it('a punaise is a knot, and the draad through it a thread', () => {
    expect(graph.nodes.find((node) => node.id === 'note:card-pin')).toMatchObject({
      kind: 'note',
      refId: 'card-pin',
      name: 'Lead',
      href: '/b/b-open',
    });
    expect(hasEdge(graph, 'thread', 'entry:e-jan', 'note:card-pin', 'punaise')).toBe(true);
  });

  /* A punaise with a bare tag is still an end of a draad: it takes the
     archive's own word for a punaise as its name rather than dropping out. */
  it('a punaise with no label is named after what it is', () => {
    expect(graph.nodes.find((node) => node.id === 'note:card-pin-kaal')?.name).toBe('Punaise');
    expect(hasEdge(graph, 'thread', 'note:card-pin-kaal', 'entry:e-toren', 'kaal')).toBe(true);
  });

  it('a notitie on a private wall stays with the wall', () => {
    const his = deps.buildWebGraph(BRAM, { notes: true });
    assertClosed(his);
    expect(his.nodes.some((node) => node.kind === 'note' && node.href === '/b/b-prive')).toBe(false);
    expect(his.nodes.some((node) => node.id === 'note:card-note')).toBe(true);
  });
});

describe('the helpers', () => {
  it('caseLinksInFields returns the label with each id, in every shape', () => {
    const fields = [
      { key: 'a', label: 'Een', kind: 'case_link' },
      { key: 'b', label: 'Meer', kind: 'case_links' },
      { key: 'c', label: 'Niet', kind: 'text' },
    ] as const;
    expect(
      deps.caseLinksInFields([...fields], { a: { id: 'c1', name: 'x' }, b: ['c2', { id: 'c3' }], c: 'c9' }),
    ).toEqual([
      { caseId: 'c1', label: 'Een' },
      { caseId: 'c2', label: 'Meer' },
      { caseId: 'c3', label: 'Meer' },
    ]);
  });

  it('noteName prefers the name, then the first forty characters of the text', () => {
    expect(deps.noteName({ name: ' Titel ', text: 'lang' })).toBe('Titel');
    expect(deps.noteName({ name: '', text: 'kort' })).toBe('kort');
    expect(deps.noteName({ name: '', text: '' })).toBe('');
    expect(deps.noteName({ name: '', text: 'a'.repeat(50) })).toBe(`${'a'.repeat(40)}…`);
  });
});
