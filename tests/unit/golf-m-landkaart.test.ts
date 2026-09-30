import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { heldByOthers, heldMarks } from '@/lib/maps/held';

/**
 * Golf M, de landkaart.
 *
 * 1. **De Bewerken-knop van een landkaart beslist alles over zijn spelden.** Wie
 *    de kaart mag bewerken (`viewerCanEditMap`: Iedereen, Gekozen personen,
 *    Privé, en een Keeper altijd) mag elke speld zetten, verschuiven,
 *    herschrijven, van laag wisselen, weghalen, terugzetten en omzetten — ook
 *    een speld die een ander zette. Wie alleen mag kijken, kijkt. Tot golf M
 *    was het "wie hem zette, of een Keeper", en zetten mocht iedereen die de
 *    kaart zag: op een Privé-kaart zette elke speler spelden, en een speler kon
 *    een speld van de Keeper niet verschuiven.
 * 2. **Andermans hand is een ring om de echte speld**, of om het `+n` als de
 *    speld in een kluitje zit — nooit een tweede speld (`lib/maps/held.ts`).
 *
 * Tegen een echt SQLite-bestand, omdat een regel die alleen in een component
 * staat decoratie is — en de kamer van een speld (`pin:{id}:fields`) is een
 * vierde weg naar dezelfde tekst.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-golf-m-map-'));
process.env.DATA_DIR = dir;

type Maps = typeof import('@/lib/maps/service');
let maps: Maps;
let sqlite: typeof import('@/lib/db').sqlite;
let admit: typeof import('@/lib/live/rooms').admit;

const KEEPER = { id: 'keeper-1', isKeeper: true };
const PIET = { id: 'piet', isKeeper: false };
const ANNA = { id: 'anna', isKeeper: false };

const setEdit = (mode: 'all' | 'some' | 'private') =>
  sqlite.prepare(`UPDATE maps SET edit_mode = ? WHERE id = 'm-eiland'`).run(mode);
const keeperPin = () =>
  maps.addPin('m-eiland', { kind: 'note', name: 'Van de Keeper', text: '', x: 0.5, y: 0.5 }, KEEPER);

beforeAll(async () => {
  const db = await import('@/lib/db');
  sqlite = db.sqlite;
  maps = await import('@/lib/maps/service');
  admit = (await import('@/lib/live/rooms')).admit;
  for (const [id, name, keeper] of [
    ['keeper-1', 'Keeper', 1],
    ['piet', 'Piet', 0],
    ['anna', 'Anna', 0],
  ] as const) {
    sqlite
      .prepare(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`)
      .run(id, name, name.toLowerCase(), keeper);
  }
  // Born the way `createMap` makes one: kijken voor iedereen, bewerken Privé.
  sqlite
    .prepare(
      `INSERT INTO maps (id, name, slug, asset_id, width, height, sort_order, created_by, view_mode, edit_mode)
       VALUES ('m-eiland', 'Het eiland', 'het-eiland', 'a1', 100, 100, 0, 'keeper-1', 'all', 'private')`,
    )
    .run();
});

describe('golf M: de Bewerken-knop van de landkaart beslist over elke speld', () => {
  it('Privé: een speler die alleen mag kijken zet, verschuift en haalt niets weg', () => {
    setEdit('private');
    const pin = keeperPin();
    expect(maps.viewerCanEditMap('m-eiland', PIET)).toBe(false);
    expect(maps.viewerCanEditPin(pin.id, PIET)).toBe(false);
    expect(() => maps.addPin('m-eiland', { kind: 'note', name: 'Stiekem', x: 0.1, y: 0.1 }, PIET)).toThrow(
      maps.PIN_NOT_ALLOWED,
    );
    expect(() => maps.updatePin(pin.id, { x: 0.2 }, PIET)).toThrow(maps.PIN_NOT_ALLOWED);
    expect(() => maps.setPinLayer(pin.id, 3, PIET)).toThrow(maps.PIN_NOT_ALLOWED);
    expect(() => maps.convertPinToEntry(pin.id, 'nergens', PIET)).toThrow(maps.PIN_NOT_ALLOWED);
    expect(() => maps.removePin(pin.id, PIET)).toThrow(maps.PIN_NOT_ALLOWED);
    // Nothing moved.
    expect(maps.getPin(pin.id, PIET)?.x).toBe(0.5);
    // And the Keeper may, always.
    expect(maps.viewerCanEditPin(pin.id, KEEPER)).toBe(true);
    maps.removePin(pin.id, KEEPER);
    // …and a speler who may only look cannot dig it up again either.
    expect(maps.restorePin(pin.id, PIET)).toBe(false);
    expect(maps.restorePin(pin.id, KEEPER)).toBe(true);
    maps.removePin(pin.id, KEEPER);
  });

  it('Iedereen: een speler verschuift, herschrijft en haalt ook de speld van de Keeper weg', () => {
    setEdit('all');
    const pin = keeperPin();
    expect(maps.viewerCanEditPin(pin.id, PIET)).toBe(true);
    const moved = maps.updatePin(pin.id, { x: 0.25, y: 0.75, name: 'Door Piet' }, PIET);
    expect([moved.x, moved.y, moved.name]).toEqual([0.25, 0.75, 'Door Piet']);
    expect(maps.setPinLayer(pin.id, 4, PIET).layer).toBe(4);
    // Rights pass; only the artikel itself is missing.
    expect(() => maps.convertPinToEntry(pin.id, 'nergens', PIET)).toThrow(/Artikel niet gevonden/);
    maps.removePin(pin.id, PIET);
    expect(maps.getPin(pin.id, PIET)).toBeUndefined();
    expect(maps.restorePin(pin.id, PIET)).toBe(true);
    // And a speld Piet set is Anna's to move just the same.
    const piets = maps.addPin('m-eiland', { kind: 'note', name: 'Van Piet', x: 0.3, y: 0.3 }, PIET);
    expect(maps.updatePin(piets.id, { x: 0.6 }, ANNA).x).toBe(0.6);
  });

  it('Gekozen personen: wie gekozen is mag alles, de rest kijkt', () => {
    setEdit('some');
    sqlite
      .prepare(
        `INSERT INTO access_grants (target_type, target_id, user_id, can_view, can_edit) VALUES ('map', 'm-eiland', 'anna', 1, 1)`,
      )
      .run();
    const pin = keeperPin();
    expect(maps.viewerCanEditPin(pin.id, ANNA)).toBe(true);
    expect(maps.viewerCanEditPin(pin.id, PIET)).toBe(false);
    expect(maps.updatePin(pin.id, { x: 0.9 }, ANNA).x).toBe(0.9);
    expect(() => maps.updatePin(pin.id, { x: 0.1 }, PIET)).toThrow(maps.PIN_NOT_ALLOWED);
    expect(() => maps.addPin('m-eiland', { kind: 'note', name: 'Nee', x: 0.1, y: 0.1 }, PIET)).toThrow(
      maps.PIN_NOT_ALLOWED,
    );
  });

  it('de kamer van een speld volgt dezelfde knop: kijken is kijken, ook live', () => {
    setEdit('private');
    const pin = keeperPin();
    const key = `pin:${pin.id}:fields`;
    // A window that writes as an onderzoeker, so §18b is not what says no.
    const PIET_AS = { ...PIET, characterId: 'onderzoeker-piet' };
    expect(admit(key, PIET_AS)?.canEdit).toBe(false);
    expect(admit(key, KEEPER)?.canEdit).toBe(true);
    // A write that arrives through the room anyway is refused by the service.
    admit(key, PIET_AS)?.spec.persist?.({ name: 'Gekaapt', text: '' } as never, PIET_AS as never);
    expect(maps.getPin(pin.id, KEEPER)?.name).toBe('Van de Keeper');
    setEdit('all');
    expect(admit(key, PIET_AS)?.canEdit).toBe(true);
  });
});

describe('golf M: andermans hand is een ring, nooit een tweede speld', () => {
  const people = [
    { clientId: 'me', name: 'Ik', colour: '#111', holding: ['a'] },
    { clientId: 'k', name: 'Keeper', colour: '#c00', holding: ['a', 'b'] },
    { clientId: 'p', name: 'Piet', colour: '#0a0', holding: ['b', 'c'] },
  ];

  it('laat de eigen tab weg en laat de eerste hand winnen', () => {
    const held = heldByOthers(people, 'me');
    expect([...held.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(held.get('a')?.name).toBe('Keeper');
    expect(held.get('b')?.name).toBe('Keeper');
    expect(held.get('c')?.name).toBe('Piet');
    expect(heldByOthers([], 'me').size).toBe(0);
  });

  it('een losse speld krijgt de ring zelf; een speld in een kluitje zet hem om het cijfertje', () => {
    const held = heldByOthers(people, 'me');
    const marks = heldMarks(
      [
        { lead: { id: 'a' }, others: [] },
        { lead: { id: 'x' }, others: [{ id: 'c' }, { id: 'y' }] },
        { lead: { id: 'z' }, others: [] },
      ],
      held,
    );
    expect([...marks.pins.keys()]).toEqual(['a']);
    expect([...marks.badges.keys()]).toEqual(['x']);
    expect(marks.badges.get('x')?.name).toBe('Piet');
    // `b` is held but drawn nowhere (hidden by the legend): no mark at all.
    expect([...marks.pins.keys(), ...marks.badges.keys()]).not.toContain('b');
  });
});
