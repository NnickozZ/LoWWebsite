import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * §77: the spelerspagina and its panel registry, against a real SQLite file.
 *
 * Two things are asked here, and they are different kinds of thing.
 *
 * The first is the **rule**: *a panel is a summary with a door — it shows the
 * smallest true thing and links to the page that owns it; nothing on a panel is
 * editable, and nothing lives in a panel that has no page of its own.* A rule
 * written only in a doc comment is a rule somebody deletes by accident, so the
 * shape of the registry is pinned: five panels, unique ids, a title that comes
 * out of `getWords`, and a `load` that reads and nothing more.
 *
 * The second is the **rights**, which is where a person's page is dangerous.
 * A spelerspagina is the one screen that shows one person's things to somebody
 * else, so every panel is asked the §9/§17 question twice over: what the
 * subject holds, narrowed to what the *reader* may see. A karakter whose fiche
 * is the Keeper's, and a dossier the reader is not on, must be absent — not
 * greyed out, not counted.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-spelers-'));
process.env.DATA_DIR = dir;

const ROOT = join(import.meta.dirname, '..', '..');

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  listSpelers: typeof import('@/lib/spelers/service').listSpelers;
  spelerBySlug: typeof import('@/lib/spelers/service').spelerBySlug;
  spelerHref: typeof import('@/lib/spelers/service').spelerHref;
  SPELER_PANELS: typeof import('@/lib/spelers/panels').SPELER_PANELS;
  spelerPagePlace: typeof import('@/lib/live/keys').spelerPagePlace;
  isWellFormedKey: typeof import('@/lib/live/keys').isWellFormedKey;
  DEFAULT_WORDS: typeof import('@/lib/words').DEFAULT_WORDS;
};
let deps: Deps;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const BRAM = { id: 'bram', isKeeper: false };
const AAGJE = { id: 'aagje', isKeeper: false };

function panel(id: string) {
  const found = deps.SPELER_PANELS.find((item) => item.id === id);
  if (!found) throw new Error(`no panel ${id}`);
  return found;
}

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  const service = await import('@/lib/spelers/service');
  const panels = await import('@/lib/spelers/panels');
  const keys = await import('@/lib/live/keys');
  const words = await import('@/lib/words');
  deps = {
    sqlite: dbModule.sqlite,
    listSpelers: service.listSpelers,
    spelerBySlug: service.spelerBySlug,
    spelerHref: service.spelerHref,
    SPELER_PANELS: panels.SPELER_PANELS,
    spelerPagePlace: keys.spelerPagePlace,
    isWellFormedKey: keys.isWellFormedKey,
    DEFAULT_WORDS: words.DEFAULT_WORDS,
  };
  const { sqlite } = deps;

  const user = (id: string, name: string, isKeeper = false) =>
    sqlite
      .prepare(
        `INSERT INTO users (id, username, username_lower, password_hash, password_enc, is_keeper)
         VALUES (?, ?, ?, 'x', 'x', ?)`,
      )
      .run(id, name, name.toLowerCase(), isKeeper ? 1 : 0);

  const entry = (id: string, name: string, visibility = 'all', createdBy = 'bram', viewMode = 'all') =>
    sqlite
      .prepare(
        `INSERT INTO entries (id, type_id, name, slug, fields, visibility, created_by, view_mode, edit_mode)
         VALUES (?, 'character', ?, ?, '{}', ?, ?, ?, 'all')`,
      )
      .run(id, name, id, visibility, createdBy, viewMode);

  user('keeper-1', 'Keeper', true);
  user('bram', 'Bram');
  user('aagje', 'Aagje');

  /*
   * Bram holds three fiches, and the three are the three answers:
   *
   *  - `nel` is everybody's;
   *  - `dagboek` is his own and nobody else's (§17's view dial), so it is on
   *    his page for him and for the Keeper and absent from Aagje's reading of
   *    it — which is the narrowing this round had to add, because
   *    `listCharacters` is written for the wardrobe and asks the *subject's*
   *    eyes, not the reader's;
   *  - `mol` is the Keeper's own (§9) and is on nobody's wardrobe at all,
   *    including the Keeper's own reading of Bram's page, for that same
   *    reason. That is `listCharacters`'s answer and not this page's to
   *    overrule.
   */
  entry('nel', 'Nel de Visser');
  entry('dagboek', 'Privé-onderzoeker', 'all', 'bram', 'private');
  entry('mol', 'De mol', 'keeper', 'keeper-1');
  sqlite
    .prepare('INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES (?, ?, ?)')
    .run('bram', 'nel', 0);
  sqlite
    .prepare('INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES (?, ?, ?)')
    .run('bram', 'dagboek', 1);
  sqlite
    .prepare('INSERT INTO user_characters (user_id, entry_id, sort_order) VALUES (?, ?, ?)')
    .run('bram', 'mol', 2);
  sqlite.prepare("UPDATE users SET active_character_id = 'nel' WHERE id = 'bram'").run();

  // Two dossiers Bram is on: one everybody may open, one only he and the
  // Keeper may (§17).
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, summary, view_mode, edit_mode, created_by)
       VALUES (?, ?, ?, '', ?, 'all', 'keeper-1')`,
    )
    .run('open-zaak', 'De open zaak', 'de-open-zaak', 'all');
  sqlite
    .prepare(
      `INSERT INTO cases (id, name, slug, summary, view_mode, edit_mode, created_by)
       VALUES (?, ?, ?, '', ?, 'all', 'keeper-1')`,
    )
    .run('stille-zaak', 'De stille zaak', 'de-stille-zaak', 'some');
  for (const caseId of ['open-zaak', 'stille-zaak']) {
    sqlite
      .prepare(
        `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit)
         VALUES ('case', ?, 'bram', 1, 0)`,
      )
      .run(caseId);
  }

  // One line in the feed, by Bram, on an artikel everybody may see.
  sqlite
    .prepare(
      `INSERT INTO activity (id, actor_id, character_id, verb, entry_id, created_at)
       VALUES ('act-1', 'bram', 'nel', 'entry.edited', 'nel', 1000)`,
    )
    .run();
});

afterAll(() => {
  deps.sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the address', () => {
  it('every account has one slug, and the page resolves it back', () => {
    const spelers = deps.listSpelers();
    expect(spelers.map((s) => s.slug)).toEqual([...new Set(spelers.map((s) => s.slug))]);
    const bram = deps.spelerBySlug('bram');
    expect(bram?.id).toBe('bram');
    expect(deps.spelerHref('bram')).toBe('/spelers/bram');
    // A slug nobody answers to is a 404, not an empty page.
    expect(deps.spelerBySlug('niemand')).toBeNull();
  });

  it('the live place is a key the gate could ever accept', () => {
    for (const speler of deps.listSpelers()) {
      const place = deps.spelerPagePlace(speler.slug);
      expect(place).toBe(`page:/spelers/${speler.slug}`);
      expect(deps.isWellFormedKey(place)).toBe(true);
    }
  });
});

describe('the panel registry', () => {
  /**
   * §85 herschikte ze. De volgorde was die waarin ze gebouwd zijn — één per
   * ronde — en die zette het paneel dat meestal leeg is (Aanwezig) vooraan en
   * de twee die bijna altijd vol zitten achteraan. Nu: waar iemand zijn
   * spullen bewaart, wie hij is, of hij er is, en dan twee lijsten.
   */
  it('is five panels with unique ids, in the order the page draws them', () => {
    expect(deps.SPELER_PANELS.map((p) => p.id)).toEqual([
      'kamer',
      'karakters',
      'nu-bezig',
      'dossiers',
      'bijdragen',
    ]);
  });

  it('every panel has a title, and it comes out of the words', () => {
    for (const item of deps.SPELER_PANELS) {
      expect(item.title(deps.DEFAULT_WORDS).length).toBeGreaterThan(0);
      expect(typeof item.load).toBe('function');
      expect(typeof item.render).toBe('function');
    }
    expect(panel('karakters').title(deps.DEFAULT_WORDS)).toBe('Karakters');
    expect(panel('kamer').title(deps.DEFAULT_WORDS)).toBe('Kamer');
    expect(panel('dossiers').title(deps.DEFAULT_WORDS)).toBe('Dossiers');
    // The Keeper renames a word and the panel's heading follows it.
    expect(panel('dossiers').title({ ...deps.DEFAULT_WORDS, casePlural: 'zaken' })).toBe('Zaken');
  });

  /**
   * §79 replaced this case, and what it now guards is the half of it that
   * survives.
   *
   * It used to assert that the kamer panel read *nothing* — no load, no
   * currency, no slots — because §78 was a reservation and the panel was one
   * honest sentence. That is no longer true and should not be: the kamer is
   * built, and the panel is its summary.
   *
   * What has not changed is §77's rule, and it is the reason this case is
   * still here: **a paneel is a summary with a door.** The panel may print a
   * balance and a count; it may not become a place where you spend. The day
   * somebody adds "quick spend" to it, a second and worse kamer-editor has
   * started inside a summary, and this line is what stops it.
   */
  it('§77: the kamer panel summarises and links, and is not a place to spend', () => {
    const source = readFileSync(join(ROOT, 'components', 'spelers', 'KamerPanel.tsx'), 'utf8');
    expect(source).not.toMatch(/<table|<progress|<input|<button|<form|<select/);
    // A door, not a control.
    expect(source).toMatch(/kamer\/|href/);
  });

  it('presence is the live line’s, so the server reads nothing for it', () => {
    expect(panel('nu-bezig').load(BRAM, deps.spelerBySlug('bram')!)).toBeNull();
    const source = readFileSync(join(ROOT, 'components', 'spelers', 'NuBezigPanel.tsx'), 'utf8');
    expect(source).not.toMatch(/lib\/live\/hub/);
  });

  it('nothing on a panel is editable', () => {
    for (const name of [
      'NuBezigPanel',
      'KaraktersPanel',
      'KamerPanel',
      'BijdragenPanel',
      'DossiersPanel',
    ]) {
      const source = readFileSync(join(ROOT, 'components', 'spelers', `${name}.tsx`), 'utf8');
      expect(source, name).not.toMatch(/'use client'/);
      expect(source, name).not.toMatch(/<(form|input|textarea|select)\b/);
    }
  });
});

describe('what a panel shows is what the reader may see', () => {
  type Karakters = { characters: { entryId: string }[]; activeId: string | null };

  it('a fiche the reader may not see is absent from somebody else’s page', () => {
    const bram = deps.spelerBySlug('bram')!;
    const mine = panel('karakters').load(BRAM, bram) as Karakters;
    expect(mine.characters.map((c) => c.entryId).sort()).toEqual(['dagboek', 'nel']);
    expect(mine.activeId).toBe('nel');

    // The narrowing: Aagje reads Bram's page and his private fiche is gone.
    const hers = panel('karakters').load(AAGJE, bram) as Karakters;
    expect(hers.characters.map((c) => c.entryId)).toEqual(['nel']);

    // A Keeper sees everything the wardrobe itself found…
    const keepers = panel('karakters').load(KEEPER, bram) as Karakters;
    expect(keepers.characters.map((c) => c.entryId).sort()).toEqual(['dagboek', 'nel']);
    // …and `mol` is in nobody's, because `listCharacters` asks the subject's
    // own eyes and a §9 keeper-only fiche is invisible to a player.
    expect(keepers.characters.some((c) => c.entryId === 'mol')).toBe(false);
  });

  it('a Keeper wears nobody, by rule and not by an empty shelf', () => {
    const keeper = deps.spelerBySlug('keeper')!;
    expect(panel('karakters').load(KEEPER, keeper)).toEqual({ characters: [], activeId: null });
  });

  it('a dossier the reader may not open is not on somebody else’s page', () => {
    const bram = deps.spelerBySlug('bram')!;
    const mine = (panel('dossiers').load(BRAM, bram) as { id: string }[]).map((c) => c.id);
    expect(mine.sort()).toEqual(['open-zaak', 'stille-zaak']);

    const hers = (panel('dossiers').load(AAGJE, bram) as { id: string }[]).map((c) => c.id);
    expect(hers).toEqual(['open-zaak']);

    // And a dossier nobody put this person on is not theirs, however open it is.
    const aagje = deps.spelerBySlug('aagje')!;
    expect(panel('dossiers').load(BRAM, aagje)).toEqual([]);
  });

  it('the contributions are one person’s, through the Start’s own feed', () => {
    const bram = deps.spelerBySlug('bram')!;
    const rows = panel('bijdragen').load(BRAM, bram) as { id: string; actorId: string | null }[];
    expect(rows.map((row) => row.id)).toEqual(['act-1']);
    expect(rows.every((row) => row.actorId === 'bram')).toBe(true);

    const aagje = deps.spelerBySlug('aagje')!;
    expect(panel('bijdragen').load(BRAM, aagje)).toEqual([]);
  });
});

describe('the page', () => {
  const page = readFileSync(join(ROOT, 'app', '(app)', 'spelers', '[naam]', 'page.tsx'), 'utf8');

  it('is live, at its own place, and 404s an unknown slug', () => {
    expect(page).toMatch(/<LivePage\b/);
    expect(page).toMatch(/spelerPagePlace\(speler\.slug\)/);
    expect(page).toMatch(/notFound\(\)/);
  });

  it('wears its own stylesheet the way an overzicht does', () => {
    expect(page).toMatch(/^import '@\/app\/spelers\.css';/m);
  });

  it('gives every panel the same hook', () => {
    expect(page).toMatch(/data-testid=\{`panel-\$\{panel\.id\}`\}/);
  });
});
