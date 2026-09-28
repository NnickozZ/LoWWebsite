import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  deltaChip,
  markLanding,
  markUnlock,
  MARK_TTL_MS,
  rollValue,
  takeLanding,
  takeUnlock,
} from '@/components/kamer/moment';
import { grantToAnnounce } from '@/components/kamer/ShellBeurs';
import {
  KLANK_MASTER,
  KLANK_MAX_SECONDS,
  KLANKEN,
  RECIPES,
  peakOf,
  recipeLength,
  renderOffline,
  spectralCentroid,
} from '@/lib/sound/recipes';
import { DEFAULT_WORDS } from '@/lib/words';

/**
 * §103 (ronde 66, *Het geld klinkt*): de kamer, de winkel en de uitdeling in
 * het expressieve register — als test.
 *
 *   A. het briefje van het neerzetten: één keer, en daarna nooit meer (K2);
 *   B. het saldo rolt tussen twee serverwaarden en nergens anders heen (K3, §79);
 *   C. één melding per gift, niet bij de eerste render en niet na herladen (K4);
 *   D. de server: de eerste koop ooit (K5), de laatste gift (K4), waar *Bekijk*
 *      heen springt (K6) en wanneer iets neergezet werd (K2);
 *   E. de vier klanken, uitgerekend: kort, zacht, warm, stil aan de randen (K8);
 *   F. de stylesheets: alleen tokens, één naam per keyframe, niets boven 700 ms;
 *   G. de woorden en de voorbeeldkaart (E18).
 *
 * D draait tegen een echt SQLite-bestand, net als `huisraad.test.ts`: de eerste
 * koop wordt uit het grootboek gelezen, in de transactie, en dat is SQL.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-66-'));
process.env.DATA_DIR = dir;

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** Een opslag in het geheugen, met de vorm van `sessionStorage`. */
function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/* ================================================================ A */

describe('§103 K2: het ding landt één keer per plaatsing', () => {
  it('plays for the tile the hand marked, and never again', () => {
    const store = memoryStore();
    markLanding({ slotId: 's1', entryId: 'e1', first: false }, { store, now: 1000 });
    expect(takeLanding('s1', 'e1', { store, now: 1200 })).toMatchObject({ slotId: 's1', entryId: 'e1' });
    // Een refresh, een herladen, een tweede render: het briefje is weg.
    expect(takeLanding('s1', 'e1', { store, now: 1300 })).toBeNull();
  });

  it('does not play for another thing on the same plek, nor for another plek', () => {
    const store = memoryStore();
    markLanding({ slotId: 's1', entryId: 'e1', first: false }, { store, now: 0 });
    expect(takeLanding('s2', 'e1', { store, now: 1 })).toBeNull();
    expect(takeLanding('s1', 'e2', { store, now: 1 })).toBeNull();
    expect(takeLanding('s1', 'e1', { store, now: 1 })).not.toBeNull();
  });

  it('lets a move land whatever it carries (entryId null)', () => {
    const store = memoryStore();
    markLanding({ slotId: 's3', entryId: null, first: false }, { store, now: 0 });
    expect(takeLanding('s3', 'anything', { store, now: 1 })).not.toBeNull();
  });

  it('carries the first purchase, and keeps one mark per plek', () => {
    const store = memoryStore();
    markLanding({ slotId: 's1', entryId: 'e1', first: false }, { store, now: 0 });
    markLanding({ slotId: 's1', entryId: 'e1', first: true }, { store, now: 5 });
    expect(takeLanding('s1', 'e1', { store, now: 6 })?.first).toBe(true);
    expect(takeLanding('s1', 'e1', { store, now: 7 })).toBeNull();
  });

  it('forgets a mark that is no longer "just now"', () => {
    const store = memoryStore();
    markLanding({ slotId: 's1', entryId: 'e1', first: false }, { store, now: 0 });
    expect(takeLanding('s1', 'e1', { store, now: MARK_TTL_MS + 1 })).toBeNull();
  });

  it('survives a storage that throws, by landing nothing', () => {
    const broken = {
      getItem: () => {
        throw new Error('privévenster');
      },
      setItem: () => {
        throw new Error('privévenster');
      },
    };
    expect(() => markLanding({ slotId: 's', entryId: 'e', first: false }, { store: broken })).not.toThrow();
    expect(takeLanding('s', 'e', { store: broken })).toBeNull();
    expect(takeLanding('s', 'e', { store: null })).toBeNull();
  });

  it('opens a plek once for the hand that opened it (K5)', () => {
    const store = memoryStore();
    markUnlock('p1', { store, now: 0 });
    expect(takeUnlock('p2', { store, now: 1 })).toBe(false);
    expect(takeUnlock('p1', { store, now: 1 })).toBe(true);
    expect(takeUnlock('p1', { store, now: 2 })).toBe(false);
  });
});

/* ================================================================ B */

describe('§103 K3: het saldo beweegt alleen tussen twee serverwaarden', () => {
  it('starts on the old value and ends on the new one', () => {
    expect(rollValue(12, 10, 0)).toBe(12);
    expect(rollValue(12, 10, 1)).toBe(10);
    expect(rollValue(12, 10, 7)).toBe(10);
    expect(rollValue(3, 15, -1)).toBe(3);
  });

  it('never shows a number outside the two — not before, not beyond (§79)', () => {
    for (const [from, to] of [
      [12, 10],
      [0, 36],
      [50, 3],
    ]) {
      for (let p = 0; p <= 1; p += 0.01) {
        const shown = rollValue(from, to, p);
        expect(Number.isInteger(shown)).toBe(true);
        expect(shown).toBeGreaterThanOrEqual(Math.min(from, to));
        expect(shown).toBeLessThanOrEqual(Math.max(from, to));
      }
    }
  });

  it('writes the chip with a sign, and a real minus', () => {
    expect(deltaChip(12)).toBe('+12');
    expect(deltaChip(-2)).toBe('−2');
  });
});

/* ================================================================ C */

describe('§103 K4: één melding per gift', () => {
  it('says nothing about what was there when the page opened', () => {
    expect(grantToAnnounce({ id: 'g1' }, 'g1', null)).toBe(false);
    expect(grantToAnnounce(null, null, null)).toBe(false);
  });

  it('announces a new grant once', () => {
    expect(grantToAnnounce({ id: 'g2' }, 'g1', null)).toBe(true);
    expect(grantToAnnounce({ id: 'g2' }, 'g1', 'g2')).toBe(false);
  });

  it('announces the first grant a player ever gets, while watching', () => {
    expect(grantToAnnounce({ id: 'g1' }, null, null)).toBe(true);
  });
});

/* ================================================================ D */

type Kamers = typeof import('@/lib/kamers/service');
type Shape = typeof import('@/lib/kamers/shape');

describe('§103: wat de server meegeeft', () => {
  let kamers: Kamers;
  let shape: Shape;
  let sqlite: typeof import('@/lib/db').sqlite;
  const KEEPER = { id: 'keeper-1', isKeeper: true };
  const BRAM = { id: 'bram', isKeeper: false };
  let ROOM: string;
  const run = (sql: string, ...args: unknown[]) => sqlite.prepare(sql).run(...args);
  const plekAt = (sortOrder: number) =>
    sqlite
      .prepare('SELECT id FROM room_slots WHERE room_id = ? AND sort_order = ?')
      .get(ROOM, sortOrder) as { id: string };
  let FREE_PLANK: number;
  let FREE_BUREAU: number;

  beforeAll(async () => {
    sqlite = (await import('@/lib/db')).sqlite;
    kamers = await import('@/lib/kamers/service');
    shape = await import('@/lib/kamers/shape');
    FREE_PLANK = shape.ROOM_SHAPE.findIndex((seed) => seed.kind === 'plank' && seed.price === 0);
    FREE_BUREAU = shape.ROOM_SHAPE.findIndex((seed) => seed.kind === 'bureau' && seed.price === 0);
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
    const HUISRAAD = (sqlite.prepare("SELECT id FROM entry_types WHERE slug = 'huisraad'").get() as { id: string }).id;
    const entry = (id: string, typeId: string, name: string, fields: object) =>
      run(
        `INSERT INTO entries (id, type_id, name, slug, fields, tags, visibility, created_by, view_mode, edit_mode)
         VALUES (?, ?, ?, ?, ?, '[]', 'all', 'keeper-1', 'all', 'all')`,
        id,
        typeId,
        name,
        id,
        JSON.stringify(fields),
      );
    entry('e-bram', 'investigator', 'Bram Kuiper', {});
    run(`INSERT INTO user_characters (user_id, entry_id) VALUES ('bram', 'e-bram')`);
    run(`UPDATE users SET active_character_id = 'e-bram' WHERE id = 'bram'`);
    entry('h-stoel', HUISRAAD, 'Een leesstoel', { [shape.VOORWERP_FIELD_KEY]: ['plank', 'bureau'], [shape.PRICE_FIELD_KEY]: 2 });
  });

  beforeEach(() => {
    run('DELETE FROM room_ledger');
    run('DELETE FROM room_slots');
    run('DELETE FROM room_drawer');
    run('DELETE FROM rooms');
    ROOM = kamers.getOrCreateRoom('e-bram')!;
  });

  it('K5: says "first" on the first purchase ever in a kamer, and never again', () => {
    kamers.grant(ROOM, 10, 'Startgeld', KEEPER);
    const first = kamers.buyFurnishing(plekAt(FREE_PLANK).id, 'h-stoel', BRAM);
    expect(first).toEqual({ spent: 2, first: true, balance: 8 });
    const second = kamers.buyFurnishing(plekAt(FREE_BUREAU).id, 'h-stoel', BRAM);
    expect(second.first).toBe(false);
  });

  /*
   * §103 golf H (D31) keerde dit om: een teruggedraaide eerste koop telt niet
   * meer mee. Wie zich vergiste en opnieuw koopt, ziet *Ingericht* alsnog —
   * netto (kopen min teruggebracht) is dat de eerste.
   */
  it('D31: after an undone first purchase, the next one is the first again (net)', () => {
    kamers.grant(ROOM, 10, 'Startgeld', KEEPER);
    expect(kamers.buyFurnishing(plekAt(FREE_PLANK).id, 'h-stoel', BRAM).first).toBe(true);
    kamers.undoPurchase(ROOM, 'h-stoel', BRAM);
    expect(kamers.buyFurnishing(plekAt(FREE_PLANK).id, 'h-stoel', BRAM).first).toBe(true);
    expect(kamers.buyFurnishing(plekAt(FREE_BUREAU).id, 'h-stoel', BRAM).first).toBe(false);
  });

  it('K2: tells the tile when its thing was put down', () => {
    kamers.grant(ROOM, 10, 'Startgeld', KEEPER);
    kamers.buyFurnishing(plekAt(FREE_PLANK).id, 'h-stoel', BRAM);
    const view = kamers.viewRoomBySlug('e-bram', BRAM)!;
    const tile = view.slots.find((slot) => slot.item?.id === 'h-stoel')!;
    expect(typeof tile.item!.placedAt).toBe('number');
  });

  it('K4: gives the newest positive grant, not a spend and not a correction', () => {
    expect(kamers.lastGrantOf(ROOM, 'bram')).toBeNull();
    kamers.grant(ROOM, 5, 'Voor sessie 12', KEEPER);
    kamers.grant(ROOM, 12, 'Voor sessie 13', KEEPER);
    kamers.buyFurnishing(plekAt(FREE_PLANK).id, 'h-stoel', BRAM);
    kamers.grant(ROOM, -1, 'Een correctie', KEEPER);
    expect(kamers.lastGrantOf(ROOM, 'bram')).toMatchObject({ delta: 12, reason: 'Voor sessie 13' });
    // Wat iemand zelf gaf, meldt de schil hem niet (een Keeper die als speler kijkt).
    expect(kamers.lastGrantOf(ROOM, 'keeper-1')).toBeNull();
  });

  it('K4: the purse carries it, so the shell guesses nothing', () => {
    kamers.grant(ROOM, 12, 'Voor sessie 13', KEEPER);
    const purse = kamers.purseOf(BRAM)!;
    expect(purse.balance).toBe(12);
    expect(purse.lastGrant).toMatchObject({ delta: 12, reason: 'Voor sessie 13' });
  });

  it('K6: tells the shop row which tile *Bekijk* goes to', () => {
    kamers.grant(ROOM, 10, 'Startgeld', KEEPER);
    const tile = plekAt(FREE_PLANK).id;
    kamers.buyFurnishing(tile, 'h-stoel', BRAM);
    const row = kamers.shopFor(BRAM, ROOM).items.find((item) => item.id === 'h-stoel')!;
    expect(row.owned).toBe(true);
    expect(row.ownedSlotId).toBe(tile);
  });
});

/* ================================================================ E */

describe('§103 K8: de vier klanken, uitgerekend', () => {
  it.each(KLANKEN)('%s is short', (kind) => {
    expect(recipeLength(RECIPES[kind])).toBeLessThanOrEqual(KLANK_MAX_SECONDS);
  });

  it.each(KLANKEN)('%s is soft: the sum never peaks above 0.15', (kind) => {
    expect(KLANK_MASTER).toBeLessThanOrEqual(0.15);
    expect(peakOf(renderOffline(RECIPES[kind]))).toBeLessThanOrEqual(0.15);
  });

  it.each(KLANKEN)('%s starts and ends in silence (no click at the edges)', (kind) => {
    const samples = renderOffline(RECIPES[kind]);
    expect(Math.abs(samples[0])).toBeLessThan(0.001);
    const tail = samples.slice(-Math.floor(44100 * 0.005));
    expect(peakOf(tail)).toBeLessThan(0.0005);
  });

  it.each(KLANKEN)('%s is warm, not a whistle', (kind) => {
    // Een grondtoon blijft onder 3,2 kHz; daarboven mag alleen een zachte boventoon.
    const loudest = Math.max(...RECIPES[kind].voices.map((voice) => voice.peak));
    for (const voice of RECIPES[kind].voices) {
      if (voice.kind === 'sine' && voice.freq > 3200) expect(voice.peak / loudest).toBeLessThanOrEqual(0.1);
    }
    expect(spectralCentroid(renderOffline(RECIPES[kind]))).toBeLessThan(3500);
  });

  it('can be told apart: the stamp is low, the key is bright, the coin rings in between', () => {
    const c = (kind: (typeof KLANKEN)[number]) => spectralCentroid(renderOffline(RECIPES[kind]));
    expect(c('stempel')).toBeLessThan(c('munt'));
    expect(c('munt')).toBeLessThan(c('sleutel'));
  });

  it('is never made while it is off: no AudioContext outside a switch that is on', () => {
    const source = read('lib/sound/klank.ts');
    // De enige `new` van een context staat achter `soundOn()` in `context()`.
    const at = source.indexOf('new Ctor()');
    expect(at).toBeGreaterThan(0);
    expect(source.slice(source.indexOf('function context('), at)).toContain('soundOn()');
  });
});

/* ================================================================ F */

describe('§103: de stylesheets van het moment', () => {
  const sheets = readdirSync(join(root, 'app'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, text: read(`app/${name}`) }));
  const ours = (text: string) => text.slice(text.indexOf('§103, ronde 66'));
  const block = (name: string) => ours(read(`app/${name}`));
  const TOKENS: Record<string, number> = {
    '--dur-1': 70,
    '--dur-2': 110,
    '--dur-3': 150,
    '--dur-4': 240,
    '--dur-5': 400,
  };

  /** Een duur als `calc(var(--dur-5) * 1.5)` uitgerekend, in ms. */
  function evaluate(expr: string): number {
    const plain = expr.replace(/var\((--dur-\d)\)/g, (_, token: string) => String(TOKENS[token])).replace(/calc/g, '');
    expect(plain, expr).toMatch(/^[\d\s.+*/()-]+$/);
    return Function(`return (${plain});`)() as number;
  }

  it('writes every duration and delay as a token, never as a number of ms', () => {
    for (const name of ['kamer.css', 'moment.css']) {
      for (const match of block(name).matchAll(/(?:animation|transition)[a-z-]*\s*:[^;]*;/g)) {
        expect(match[0], name).not.toMatch(/\d(ms|s)\b/);
      }
    }
  });

  it('names every keyframe once, in every stylesheet of the app', () => {
    const seen = new Map<string, string>();
    for (const { name, text } of sheets) {
      for (const match of text.matchAll(/@keyframes\s+([\w-]+)/g)) {
        // §102/K1: `plek-aangewezen` is agent A's to make single, and not this round's.
        if (match[1] === 'plek-aangewezen') continue;
        expect(seen.has(match[1]), `${match[1]} in ${name} en ${seen.get(match[1])}`).toBe(false);
        seen.set(match[1], name);
      }
    }
    for (const mine of ['kamer-neerzet', 'kamer-ingericht', 'kamer-slot-open', 'kamer-slot-valt', 'kamer-koop-stempel', 'uitdelen-chip-op', 'saldo-chip-op']) {
      expect(seen.has(mine), mine).toBe(true);
    }
  });

  /** `animation: naam duur easing [vertraging] vulling` in stukken, met de haakjes heel. */
  function parts(value: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value.trim()) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (/\s/.test(ch) && depth === 0) {
        if (current) out.push(current);
        current = '';
      } else current += ch;
    }
    if (current) out.push(current);
    return out;
  }

  it('moves nothing in the kamer or the winkel for longer than 700 ms', () => {
    let counted = 0;
    for (const name of ['kamer.css', 'moment.css']) {
      for (const match of block(name).matchAll(/animation:\s*([^;]+);/g)) {
        const [animation, duration, , delay] = parts(match[1]);
        if (animation === 'none') continue;
        const total = evaluate(duration) + (delay && delay.includes('--dur') ? evaluate(delay) : 0);
        expect(total, animation).toBeLessThanOrEqual(700);
        counted += 1;
      }
    }
    expect(counted).toBeGreaterThanOrEqual(8);
  });

  it('gives every new animation a reduced-motion branch', () => {
    // Elke animatie in het blok staat binnen `prefers-reduced-motion: no-preference`,
    // behalve het slotje, dat `Ontsloten` onder reduced motion niet tekent.
    const kamer = block('kamer.css');
    const outside = kamer.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, '');
    const loose = [...outside.matchAll(/^\s*animation:\s*([\w-]+)/gm)].map((match) => match[1]);
    expect(loose.sort()).toEqual(['kamer-slot-open', 'kamer-slot-valt']);
    expect(read('components/kamer/Neerzetten.tsx')).toMatch(/if \(!reducedMotion\(\)\) setOpen\(true\)/);
  });

  it('never paints a saldo red', () => {
    for (const name of ['moment.css']) {
      const chip = block(name);
      expect(chip).not.toContain('--stamp-red');
    }
  });
});

/* ================================================================ G */

describe('§103: de woorden en de voorbeeldkaart', () => {
  it('keeps the gaps in every sentence that has one', () => {
    expect(DEFAULT_WORDS.buyShort).toContain('{knop}');
    // §103 herstel (#18): de prijs staat één keer per rij, als stempel — niet meer op de knop.
    expect(DEFAULT_WORDS.buyShort).not.toContain('{n}');
    expect(DEFAULT_WORDS.buyShort).toContain('{plek}');
    expect(DEFAULT_WORDS.grantArrived).toContain('{bedrag}');
    expect(DEFAULT_WORDS.grantArrived).toContain('{reden}');
    expect(DEFAULT_WORDS.grantArrived).toContain('{keeper}');
    expect(DEFAULT_WORDS.grantArrivedPlain).toContain('{bedrag}');
  });

  it('speaks in the archive’s voice: no exclamation marks', () => {
    for (const key of ['buyBought', 'furnishedStamp', 'grantArrived', 'shopOwnedShort', 'shopOwnedShow', 'soundLabel', 'soundNote']) {
      expect(DEFAULT_WORDS[key], key).toBeTruthy();
      expect(DEFAULT_WORDS[key], key).not.toContain('!');
    }
  });

  /**
   * E18: de voorbeeldkaart zoekt het dichtstbijzijnde `[data-entry-id]`. Op de
   * hele winkelrij en op de koopknop sprong hij op boven de knop; nu draagt
   * alleen de naam hem.
   */
  it('puts data-entry-id on the name only, in the winkel and in the catalogue', () => {
    const rij = read('components/winkel/WinkelRij.tsx');
    const li = rij.slice(rij.indexOf('<li'), rij.indexOf('>', rij.indexOf('data-afford')));
    expect(li).not.toMatch(/data-entry-id=/);
    expect(rij).toMatch(/data-testid="winkel-naam" data-entry-id=\{item\.id\}/);
    expect(read('components/winkel/BuyButton.tsx')).not.toContain('data-entry-id');
    const catalogue = read('components/kamer/PlaceButton.tsx');
    expect(catalogue).toMatch(/data-testid="plek-catalogus-naam" data-entry-id=\{entry\.id\}/);
    const row = catalogue.slice(catalogue.indexOf('data-testid="plek-catalogus-rij"') - 200, catalogue.indexOf('data-afford'));
    expect(row).not.toMatch(/data-entry-id=/);
  });
});
