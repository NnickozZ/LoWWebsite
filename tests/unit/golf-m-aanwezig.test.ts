import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cameraSpot,
  isWellFormedSpot,
  parseSpot,
  sectionSpot,
  SPOT_PARAM,
  spotFitsPlace,
  spotOfHref,
  withSpot,
} from '@/lib/live/spot';

/**
 * Golf M (A2–A4): *Wie is er?* rechtsboven, *Ga naar* tot op de plek, en *Kom
 * kijken* als uitnodiging die je op de plek van de vrager laat landen.
 *
 * De pure helft (`lib/live/spot.ts`) en de helft die rechten stelt
 * (`spotForViewer`, `rosterFor`, `nudge` in `lib/live/roster.ts`), die tweede
 * tegen een echt SQLite-bestand, net als `roster.test.ts`: een plek aan een deur
 * hangen is een vraag over rechten.
 */

const ROOT = join(__dirname, '..', '..');

describe('spot.ts — een plek is een camera of een sectie, en verder niets', () => {
  it('maakt een camera heen en terug, met getallen op tien cijfers', () => {
    const spot = cameraSpot('board', 'b-1', { x: -120.123456789123, y: 40, zoom: 0.8 });
    expect(spot).toMatch(/^c\.board\.b-1\./);
    const parsed = parseSpot(spot);
    expect(parsed).toEqual({ kind: 'camera', canvas: 'board', id: 'b-1', view: { x: -120.1234568, y: 40, zoom: 0.8 } });
  });

  it('draagt geen tekst in een camera — een naam kan er niet in', () => {
    const spot = cameraSpot('map', 'm-1', { zoom: 2, tx: 3, ty: 4, label: 'Het complot' });
    const parsed = parseSpot(spot);
    expect(parsed?.kind).toBe('camera');
    expect(JSON.stringify(parsed)).not.toContain('complot');
  });

  it('een tijdlijn in seconden blijft op de seconde', () => {
    const view = { origin: -22_089_876_543.25, pxPerSecond: 0.000_001_234_567_89 };
    const parsed = parseSpot(cameraSpot('timeline', 't-1', view));
    expect(parsed?.kind === 'camera' && (parsed.view as typeof view).origin).toBeCloseTo(view.origin, -1);
  });

  it('weigert wat geen plek is', () => {
    for (const bad of ['', 'x.board.b.eyJ9', 'c.web.b.eyJ9', 's.', 's.a b', 'c.board.b-1.!!', 'c.board..eyJ9', 'x'.repeat(500)]) {
      expect(isWellFormedSpot(bad), bad).toBe(false);
      expect(parseSpot(bad), bad).toBeNull();
    }
    expect(cameraSpot('board', 'b 1', { x: 1 })).toBeNull();
    expect(sectionSpot('s-1')).toBe('s.s-1');
  });

  it('een camera hoort alleen bij zijn eigen vlak, een sectie bij een pagina met secties', () => {
    const cam = cameraSpot('timeline', 't-1', { origin: 1, pxPerSecond: 2 })!;
    expect(spotFitsPlace('timeline:t-1', cam)).toBe(true);
    // Een tijdlijn in een dossier: de plaats is het dossier, en haar camera gaat niet mee.
    expect(spotFitsPlace('case:c-1', cam)).toBe(false);
    expect(spotFitsPlace('timeline:t-2', cam)).toBe(false);
    expect(spotFitsPlace('entry:e-1', 's.s-1')).toBe(true);
    expect(spotFitsPlace('case:c-1', 's.s-1')).toBe(true);
    expect(spotFitsPlace('board:b-1', 's.s-1')).toBe(false);
    expect(spotFitsPlace('page:/wiki', 's.s-1')).toBe(false);
    expect(spotFitsPlace(null, 's.s-1')).toBe(false);
  });

  it('zet een plek in een adres en haalt hem er weer uit', () => {
    const href = withSpot('/b/b-1?card=k', 's.x');
    expect(href).toBe(`/b/b-1?card=k&${SPOT_PARAM}=s.x`);
    expect(spotOfHref(href)).toBe('s.x');
    expect(withSpot(href, null)).toBe('/b/b-1?card=k');
    expect(spotOfHref('/b/b-1?waar=onzin')).toBeNull();
  });
});

/* ======================================================== met een archief */

const dir = mkdtempSync(join(tmpdir(), 'zcf-golf-m-'));
process.env.DATA_DIR = dir;

type Roster = typeof import('@/lib/live/roster');
type Hub = typeof import('@/lib/live/hub');
type Gate = typeof import('@/lib/live/gate');

let roster: Roster;
let hub: Hub;
let gate: Gate;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const PEOPLE = new Map([
  ['keeper-1', { username: 'Keeper', isKeeper: true }],
  ['bram', { username: 'Bram', isKeeper: false }],
]);

type Frame = { event: string; data: unknown };
function tab(clientId: string, userId: string, name: string) {
  const inbox: Frame[] = [];
  const connection = hub.connect({ id: `conn-${clientId}`, clientId, userId, name, send: (e) => inbox.push(e as Frame) });
  return { connection, inbox, of: (event: string) => inbox.filter((f) => f.event === event) };
}

beforeAll(async () => {
  const { sqlite } = await import('@/lib/db');
  roster = await import('@/lib/live/roster');
  hub = await import('@/lib/live/hub');
  gate = await import('@/lib/live/gate');
  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['bram', 'Bram', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  run(
    `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
     VALUES ('e-open', 'character', 'De veerman', 'de-veerman', '{}', '[]', 'all', 'keeper-1', 'all')`,
  );
  // Twee secties op één artikel: één voor iedereen, één van de Keeper.
  run(
    `INSERT INTO sections (id, owner_kind, owner_id, title, visibility) VALUES ('s-open', 'entry', 'e-open', 'De overtocht', 'all')`,
  );
  run(
    `INSERT INTO sections (id, owner_kind, owner_id, title, visibility) VALUES ('s-geheim', 'entry', 'e-open', 'Wat hij verzwijgt', 'keeper')`,
  );
  run(
    `INSERT INTO boards (id, name, state, view_mode, edit_mode, created_by) VALUES ('b-open', 'Het bord', '{}', 'all', 'all', 'keeper-1')`,
  );
});

beforeEach(() => {
  hub.resetSiteHub();
  roster.resetRoster();
  roster.forgetPlaceLabels();
});

describe('spotForViewer — een plek alleen voor wie hem mag weten', () => {
  it('een camera op het vlak zelf gaat mee, zonder woord erbij', () => {
    const cam = cameraSpot('board', 'b-open', { x: 1, y: 2, zoom: 1 })!;
    expect(roster.spotForViewer(BRAM, 'board:b-open', cam)).toEqual({ spot: cam, detail: null });
    expect(roster.spotForViewer(BRAM, 'board:b-ander', cam)).toBeNull();
  });

  it('een sectie gaat mee met haar titel, als je haar mag lezen — anders is er niets', () => {
    expect(roster.spotForViewer(BRAM, 'entry:e-open', 's.s-open')).toEqual({ spot: 's.s-open', detail: 'De overtocht' });
    expect(roster.spotForViewer(BRAM, 'entry:e-open', 's.s-geheim')).toBeNull();
    expect(roster.spotForViewer(KEEPER, 'entry:e-open', 's.s-geheim')).toEqual({
      spot: 's.s-geheim',
      detail: 'Wat hij verzwijgt',
    });
    // Een sectie van een ander ding dan de plaats zelf: niet.
    expect(roster.spotForViewer(KEEPER, 'entry:e-ander', 's.s-open')).toBeNull();
    expect(roster.spotForViewer(null, 'entry:e-open', 's.s-open')).toBeNull();
  });
});

describe('de rij en de uitnodiging dragen de plek', () => {
  it('een rij gaat naar de sectie waar iemand leest, en zegt welke', () => {
    const window = {
      key: roster.windowId('keeper-1', 'Keeper'),
      userId: 'keeper-1',
      name: 'Keeper',
      colour: '#123456',
      place: 'entry:e-open',
      spot: 's.s-open',
      places: new Set(['entry:e-open']),
      verb: 'kijkt' as const,
      freshness: 0,
      resting: false,
    };
    const frame = roster.rosterFor(
      KEEPER,
      [window],
      PEOPLE,
      (key) => gate.canWatch(key, KEEPER),
      Date.now(),
      (place, spot) => roster.spotForViewer(KEEPER, place, spot),
    );
    expect(frame.rows[0].href).toBe(withSpot('/e/de-veerman', 's.s-open'));
    expect(frame.rows[0].detail).toBe('De overtocht');

    // De Keeper leest zijn eigen sectie; een speler ziet de pagina, niet de sectie.
    const hidden = roster.rosterFor(
      BRAM,
      [{ ...window, spot: 's.s-geheim' }],
      PEOPLE,
      (key) => gate.canWatch(key, BRAM),
      Date.now(),
      (place, spot) => roster.spotForViewer(BRAM, place, spot),
    );
    // Golf N: een Keeper is voor een speler niet meer `quiet`. De speler krijgt
    // de pagina die hij mag lezen, maar niet de Keepersectie: geen `?waar=`.
    expect(hidden.rows[0].mode).toBe('place');
    expect(hidden.rows[0].href).toBe('/e/de-veerman');
    expect(hidden.rows[0].detail).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('verzwijgt');
    expect(JSON.stringify(hidden)).not.toContain('s-geheim');
  });

  it('een speler die een sectie leest die de ander niet mag zien, wordt zonder plek gevolgd', () => {
    const window = {
      key: roster.windowId('bram', 'Bram'),
      userId: 'bram',
      name: 'Bram',
      colour: '#123456',
      place: 'entry:e-open',
      spot: 's.s-geheim',
      places: new Set(['entry:e-open']),
      verb: 'kijkt' as const,
      freshness: 0,
      resting: false,
    };
    const asBram = roster.rosterFor(
      BRAM,
      [window],
      PEOPLE,
      (key) => gate.canWatch(key, BRAM),
      Date.now(),
      (place, spot) => roster.spotForViewer(BRAM, place, spot),
    );
    expect(asBram.rows[0].href).toBe('/e/de-veerman');
    expect(asBram.rows[0].detail).toBeNull();
  });

  it('de hub bewaart alleen een plek die bij de plaats hoort, en vergeet hem bij een nieuwe plaats', () => {
    const keeper = tab('t-k', 'keeper-1', 'Keeper');
    hub.setPlace(keeper.connection, 'board:b-open');
    const cam = cameraSpot('board', 'b-open', { x: 1, y: 2, zoom: 1.5 })!;
    hub.setSpot(keeper.connection, 'board:b-open', cam);
    expect(keeper.connection.spot).toBe(cam);
    // Een plek voor een plaats waar deze tab niet (meer) staat: weg.
    hub.setSpot(keeper.connection, 'board:elders', 's.x');
    expect(keeper.connection.spot).toBe(cam);
    hub.setPlace(keeper.connection, 'entry:e-open');
    expect(keeper.connection.spot ?? null).toBeNull();
  });

  it('Kom kijken brengt de ander naar de camera van de vrager', () => {
    const keeper = tab('t-k2', 'keeper-1', 'Keeper');
    const bram = tab('t-b2', 'bram', 'Bram');
    hub.setPlace(keeper.connection, 'board:b-open');
    const cam = cameraSpot('board', 'b-open', { x: 10, y: 20, zoom: 2 })!;
    hub.setSpot(keeper.connection, 'board:b-open', cam);
    expect(roster.nudge(keeper.connection, roster.windowId('bram', 'Bram'))).toBe('ok');
    const frame = bram.of('nudge').at(-1)?.data as { href: string };
    expect(frame.href).toBe(withSpot('/b/b-open', cam));
  });

  it('Kom kijken vanaf een geheime sectie brengt de ander naar de pagina, niet naar de sectie', () => {
    const keeper = tab('t-k3', 'keeper-1', 'Keeper');
    const bram = tab('t-b3', 'bram', 'Bram');
    hub.setPlace(keeper.connection, 'entry:e-open');
    hub.setSpot(keeper.connection, 'entry:e-open', 's.s-geheim');
    expect(roster.nudge(keeper.connection, roster.windowId('bram', 'Bram'))).toBe('ok');
    const frame = bram.of('nudge').at(-1)?.data as { href: string; detail: string | null };
    expect(frame.href).toBe('/e/de-veerman');
    expect(frame.detail).toBeNull();
    expect(JSON.stringify(frame)).not.toContain('geheim');
  });
});

describe('A1 en A2 in de stylesheets', () => {
  const css = (file: string) => readFileSync(join(ROOT, 'app', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('de plaats van de strip staat op één plek, per maat één regel, en niets verslaat hem', () => {
    const nav = css('navigatie.css');
    // Een tekenvlak (het prikbord ook) en elke pagina vanaf 1880 px: in de band, rechtsboven.
    expect(nav).toMatch(/\.main:has\(\.page-canvas\) > \.live-strip \{\s*position: absolute;/);
    expect(nav).toMatch(/@media \(min-width: 1880px\) \{\s*\.main > \.live-strip \{\s*position: absolute;/);
    // Daartussen de float van altijd, en die regel is begrensd, dus hij kan de 1880-regel niet verslaan.
    expect(nav).toMatch(/@media \(min-width: 768px\) and \(max-width: 1879px\) \{\s*\.main:not\(:has\(\.page-canvas\)\) > \.live-strip \{\s*position: relative;/);
    const globals = css('globals.css');
    // Golf K's regel voor 1880 px, die van golf h1 verloor, is weg.
    expect(globals).not.toMatch(/@media \(min-width: 1880px\) \{\s*\.main \.live-strip/);
    expect(globals).not.toMatch(/margin-right: calc\(0\.5rem - var\(--page-pad\)\)/);
  });

  it('het prikbord zet de strip niet meer uit, en tekent geen eigen rij schijfjes', () => {
    const page = readFileSync(join(ROOT, 'app', '(app)', 'b', '[id]', 'page.tsx'), 'utf8');
    expect(page).not.toMatch(/presence=\{false\}/);
    const canvas = readFileSync(join(ROOT, 'components', 'boards', 'BoardCanvas.tsx'), 'utf8');
    expect(canvas).not.toMatch(/className="board-people"/);
  });

  it('Kom kijken staat er altijd, niet pas bij een hover', () => {
    expect(css('aanwezig.css')).not.toMatch(/\.roster-ask \{[^}]*opacity: 0;/);
  });
});

describe('de plek overleeft de omweg naar de andere kant', () => {
  it('een prikbord en een landkaart geven hun adres mee aan sideDetour, met ?waar= erin', () => {
    for (const file of [
      ['app', '(app)', 'b', '[id]', 'page.tsx'],
      ['app', '(app)', 'maps', '[slug]', 'page.tsx'],
    ]) {
      const page = readFileSync(join(ROOT, ...file), 'utf8');
      const call = page.split('\n').find((line) => line.includes('sideDetour('));
      expect(call, file.join('/')).toMatch(/queryTail\(/);
    }
  });
});
