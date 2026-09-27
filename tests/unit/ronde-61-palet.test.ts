import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  _resetSaves,
  clearSave,
  combineReports,
  onSaveChange,
  readSave,
  reportSave,
} from '@/components/live/saveRegister';
import { saveLabel, toSaveReport } from '@/components/entry/useAutosave';
import { syncReport as boardReport } from '@/components/boards/useBoardSync';
import { syncReport as treeReport } from '@/components/families/useTreeSync';
import { OFFLINE_MESSAGE } from '@/lib/boards/retry';
import { filterActions, paletteActions, paletteMode, type PaletteRole } from '@/lib/palette/actions';
import { pushRecent, recentPath, RECENT_MAX } from '@/lib/palette/recent';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX } from '@/lib/words';

/**
 * §100 (ronde 61): het palet en één opslaan.
 *
 *   register     wie het luidst roept wint: een fout boven niet-binnen boven
 *                bezig boven opgeslagen; een schrijver die weggaat, is weg;
 *   onlangs      een adres uit de browser is een vraag: wat de lezer niet
 *                (meer) mag zien, komt niet terug — niet als naam en niet als
 *                rij — en de Keeper leest van één kant tegelijk (§46);
 *   handelingen  per rol: §44, wat van de Keeper is, is voor een speler
 *                afwezig; zonder onderzoeker alleen het eerste artikel (§18b).
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-r61-palet-'));
process.env.DATA_DIR = dir;

type Resolve = typeof import('@/lib/search/recent').resolveRecent;
let resolveRecent: Resolve;

const KEEPER_SPELERSKANT = { id: 'keeper-1', isKeeper: true, side: 'player' } as const;
const KEEPER_KEEPERKANT = { id: 'keeper-1', isKeeper: true, side: 'keeper' } as const;
const BRAM = { id: 'bram', isKeeper: false, side: 'player' } as const;

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  resolveRecent = (await import('@/lib/search/recent')).resolveRecent;
  const run = (sql: string, ...args: unknown[]) => dbModule.sqlite.prepare(sql).run(...args);

  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper Kees', 1],
    ['bram', 'Bram Ossewaarde', 0],
  ] as const) {
    run(
      `INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`,
      id,
      name,
      name.toLowerCase(),
      keeper,
    );
  }
  const entry = (id: string, name: string, visibility = 'all') =>
    run(
      `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode)
       VALUES (?, 'character', ?, ?, '{}', '[]', ?, 'keeper-1', 'all')`,
      id,
      name,
      id,
      visibility,
    );
  entry('de-vuurtoren', 'De vuurtoren');
  entry('wat-er-gebeurde', 'Wat er werkelijk gebeurde', 'keeper');

  run(`INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES ('c-open', 'Holle Tij', 'holle-tij', 'keeper-1', 0)`);
  run(`INSERT INTO cases (id, name, slug, created_by, keeper_only) VALUES ('c-dicht', 'Zwarte Vloed', 'zwarte-vloed', 'keeper-1', 1)`);
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode) VALUES ('b-open', 'De muur', '{"cards":[],"strings":[]}', 'bram', 'all')`,
  );
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode) VALUES ('b-prive', 'Privé muur', '{"cards":[],"strings":[]}', 'keeper-1', 'private')`,
  );
  run(
    `INSERT INTO boards (id, name, state, created_by, view_mode, deleted_at) VALUES ('b-weg', 'Weg muur', '{"cards":[],"strings":[]}', 'bram', 'all', 1)`,
  );
});

beforeEach(() => _resetSaves());

/* ------------------------------------------------------------ register */

describe('§100 het register — één opslaan-woord', () => {
  it('zegt niets zonder schrijver, en leeg met een schrijver die nog niets zei', () => {
    expect(readSave().state).toBe('none');
    reportSave('a', 'idle');
    expect(readSave()).toMatchObject({ state: 'idle', writers: 1 });
    clearSave('a');
    expect(readSave().state).toBe('none');
  });

  it('de luidste wint: fout > niet binnen > bezig > voorstel > opgeslagen', () => {
    expect(combineReports([{ state: 'saved' }, { state: 'saving' }]).state).toBe('saving');
    expect(combineReports([{ state: 'saving' }, { state: 'offline' }]).state).toBe('offline');
    expect(combineReports([{ state: 'offline' }, { state: 'error', message: 'Nee.' }])).toMatchObject({
      state: 'error',
      message: 'Nee.',
    });
    expect(combineReports([{ state: 'saved' }, { state: 'pending' }]).state).toBe('pending');
    expect(combineReports([{ state: 'idle' }, { state: 'saved' }]).state).toBe('saved');
  });

  it('een schrijver die weggaat neemt zijn melding mee, en een luisteraar hoort het', () => {
    let heard = 0;
    const off = onSaveChange(() => heard++);
    reportSave('artikel', 'saved');
    reportSave('inkt', 'saving');
    expect(readSave().state).toBe('saving');
    clearSave('inkt');
    expect(readSave().state).toBe('saved');
    // Hetzelfde nog eens zeggen is geen nieuws.
    const before = heard;
    reportSave('artikel', 'saved');
    expect(heard).toBe(before);
    off();
  });

  it('de zinnen blijven die waar de specs op leunen (B15 inbegrepen)', () => {
    expect(saveLabel('saving')).toBe('Opslaan…');
    expect(saveLabel('saved')).toBe('Opgeslagen');
    expect(saveLabel('offline')).toBe(DEFAULT_WORDS.saveOffline);
    expect(toSaveReport('dirty')).toBe('saving');
  });

  it('het prikbord zegt "niet binnen" bij een dode lijn (het probeert opnieuw); de stamboom een fout', () => {
    expect(boardReport('error', OFFLINE_MESSAGE)).toBe('offline');
    expect(boardReport('error', 'Niet opgeslagen. Je mag hier niet prikken.')).toBe('error');
    expect(boardReport('dirty')).toBe('saving');
    expect(treeReport('error')).toBe('error');
    expect(treeReport('saved')).toBe('saved');
  });
});

/* ------------------------------------------------------------- onlangs */

describe('§100 Onlangs — alleen adressen, en rule 1 bij het tonen', () => {
  it('bewaart alleen dingen, zonder dubbelen, het nieuwste bovenaan', () => {
    expect(recentPath('/e/de-vuurtoren?new=1')).toBe('/e/de-vuurtoren');
    expect(recentPath('/b/b-open#x')).toBe('/b/b-open');
    expect(recentPath('/wiki')).toBeNull();
    expect(recentPath('/admin/woorden')).toBeNull();
    expect(recentPath('/')).toBeNull();
    let list: string[] = [];
    for (let i = 0; i < RECENT_MAX + 3; i++) list = pushRecent(list, `/e/a${i}`);
    list = pushRecent(list, `/e/a${RECENT_MAX + 1}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toBe(`/e/a${RECENT_MAX + 1}`);
    expect(new Set(list).size).toBe(list.length);
  });

  it('een speler krijgt terug wat hij mag zien — en van de rest niets', () => {
    const asked = ['/e/wat-er-gebeurde', '/e/de-vuurtoren', '/c/zwarte-vloed', '/c/holle-tij', '/b/b-prive', '/b/b-weg', '/b/b-open'];
    const hits = resolveRecent(BRAM, asked);
    expect(hits.map((hit) => hit.href)).toEqual(['/e/de-vuurtoren', '/c/holle-tij', '/b/b-open']);
    const said = JSON.stringify(hits);
    for (const secret of ['Wat er werkelijk', 'Zwarte Vloed', 'Privé muur', 'Weg muur']) expect(said).not.toContain(secret);
  });

  it('de Keeper leest van één kant tegelijk (§46)', () => {
    const asked = ['/e/wat-er-gebeurde', '/e/de-vuurtoren', '/c/zwarte-vloed', '/c/holle-tij'];
    expect(resolveRecent(KEEPER_SPELERSKANT, asked).map((hit) => hit.href)).toEqual(['/e/de-vuurtoren', '/c/holle-tij']);
    expect(resolveRecent(KEEPER_KEEPERKANT, asked).map((hit) => hit.href)).toEqual(['/e/wat-er-gebeurde', '/c/zwarte-vloed']);
  });

  it('een adres dat geen ding is, of rommel, wordt niet eens gevraagd', () => {
    expect(resolveRecent(BRAM, ['/admin', 'javascript:alert(1)', '%E0%A4%A', ''])).toEqual([]);
  });
});

/* --------------------------------------------------------- handelingen */

const player: PaletteRole = {
  words: DEFAULT_WORDS,
  keeperHere: false,
  mayType: true,
  purse: { slug: 'jan', roomId: 'r1' },
  myPage: '/spelers/bram',
  characters: [
    { entryId: 'jan', name: 'Jan Kaland' },
    { entryId: 'mies', name: 'Mies' },
  ],
  activeId: 'jan',
  side: 'player',
};

const keys = (role: PaletteRole) => paletteActions(role).map((action) => action.key);

describe('§100 handelingen per rol', () => {
  it('een speler met een karakter: maken, zijn plek, wisselen — en niets van de Keeper', () => {
    const got = keys(player);
    for (const key of ['new-entry', 'new-case', 'new-board', 'new-timeline', 'new-tree', 'kamer', 'winkel', 'mine', 'spelers', 'play-mies', 'play-self', 'settings']) {
      expect(got).toContain(key);
    }
    // Wie je al speelt, kies je niet nog eens.
    expect(got).not.toContain('play-jan');
    // §44: absent, not disabled.
    for (const key of ['new-map', 'flip', 'uitdelen', 'admin']) expect(got).not.toContain(key);
  });

  it('de winkel gaat naar de kamer die je speelt (§90)', () => {
    const shop = paletteActions(player).find((action) => action.key === 'winkel');
    expect(shop?.run).toEqual({ kind: 'href', href: '/winkel?kamer=r1' });
  });

  it('zonder onderzoeker: alleen het eerste artikel, geen kamer, geen wissel (§18b)', () => {
    const got = keys({ ...player, mayType: false, purse: null, characters: [], activeId: null });
    expect(got).toContain('new-entry');
    for (const key of ['new-case', 'new-board', 'kamer', 'winkel', 'mine', 'play-self']) expect(got).not.toContain(key);
  });

  it('de Keeper: de kant, Uitdelen, Beheer en een landkaart — en geen karakters', () => {
    const got = keys({ ...player, keeperHere: true, purse: null, characters: [], activeId: null, side: 'keeper' });
    for (const key of ['new-map', 'flip', 'uitdelen', 'admin', 'mine']) expect(got).toContain(key);
    expect(got).not.toContain('kamer');
    const flip = paletteActions({ ...player, keeperHere: true, side: 'keeper' }).find((action) => action.key === 'flip');
    expect(flip?.label).toBe(DEFAULT_WORDS.toPlayerSide);
    expect(flip?.run).toEqual({ kind: 'flip' });
  });

  it('> laat alleen handelingen zien, en typen vernauwt op het begin van een woord', () => {
    expect(paletteMode('> nieuw').actionsOnly).toBe(true);
    expect(paletteMode('> nieuw').text).toBe('nieuw');
    expect(paletteMode('vuurtoren').actionsOnly).toBe(false);
    const all = paletteActions(player);
    expect(filterActions(all, 'nie pri').map((a) => a.key)).toEqual(['new-board']);
    expect(filterActions(all, 'kamer').map((a) => a.key)).toEqual(['kamer']);
    expect(filterActions(all, '').length).toBe(all.length);
  });
});

describe('§100 woorden', () => {
  it('staan in hun eigen groep, en passen in WORD_MAX', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'Het palet');
    expect(group).toBeDefined();
    for (const word of group!.words) expect(word.fallback.length).toBeLessThanOrEqual(WORD_MAX);
    expect(DEFAULT_WORDS.paletteRecent).toBe('Onlangs');
  });
});
