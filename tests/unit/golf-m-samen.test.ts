import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLLOW_OMEGA, FOLLOW_OMEGA_MAX, FOLLOW_OMEGA_MIN, FOLLOW_SNAP_PX, Follower, omegaFor, springAxis, translateValue } from '@/lib/canvas/follow';
import {
  CARRY_KEEPALIVE_MS,
  HAND_STALE_MS,
  SETTLE_MS,
  carries,
  conflictFor,
  heldLocks,
  settleCarry,
  takeHands,
  winsTie,
  type Carry,
  type HandLike,
} from '@/lib/live/hands';
import { POINTER_CARRY_THROTTLE_MS, POINTER_THROTTLE_MS, pointerWait } from '@/lib/live/wire';
import { emptyTreeState, mergeTreeState, normaliseTreeState, stateEntryIds } from '@/lib/families/merge';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX } from '@/lib/words';

/**
 * Golf M (samen): wat een ander sleept glijdt, wat een ander vasthoudt is
 * niet te pakken, en wat een ander weghaalt komt niet terug.
 *
 * De pure helften: de veer (`lib/canvas/follow.ts`), het zachte slot en de
 * draag (`lib/live/hands.ts`), het tempo van de lijn (`lib/live/wire.ts`) en
 * de stamboom-merge die een verplaatsing niet meer als terugzetting leest.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const ONE = { x: 1, y: 1 };

const hand = (clientId: string, m: Record<string, [number, number]> = {}, name = clientId): HandLike => ({
  clientId,
  name,
  colour: `#${clientId.length}00`,
  m,
});

describe('de veer — wat een ander sleept, glijdt', () => {
  it('trekt naar het doel zonder door te schieten', () => {
    let e = 100;
    let v = 0;
    const seen: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      [e, v] = springAxis(e, v, 1 / 60);
      seen.push(e);
    }
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
    expect(seen[seen.length - 1]).toBeLessThan(1);
  });

  it('is stabiel bij een grote stap (exact, geen Euler)', () => {
    const [e, v] = springAxis(50, 0, 1);
    expect(Number.isFinite(e) && Number.isFinite(v)).toBe(true);
    expect(Math.abs(e)).toBeLessThan(1);
  });

  it('staat bij het eerste frame meteen op het doel', () => {
    const follower = new Follower();
    follower.retarget(new Map([['a', { x: 10, y: 20 }]]), ONE);
    expect(follower.offset('a', ONE)).toEqual({ x: 0, y: 0 });
    expect(follower.moving()).toBe(false);
  });

  it('maakt van frames om de 50 ms één doorgaande beweging, zonder stilstand', () => {
    const follower = new Follower();
    follower.retarget(new Map([['a', { x: 0, y: 0 }]]), ONE);
    const drawn: number[] = [];
    let target = 0;
    // Een hand die gelijkmatig 300 px/s sleept, frames om de 50 ms, 60 beelden per seconde.
    for (let frame = 0; frame < 60; frame += 1) {
      const t = frame * (1000 / 60);
      const due = Math.floor(t / POINTER_CARRY_THROTTLE_MS) * 15;
      if (due !== target) {
        target = due;
        follower.retarget(new Map([['a', { x: target, y: 0 }]]), ONE);
      }
      follower.step(1000 / 60, ONE);
      drawn.push(target + follower.offset('a', ONE).x);
    }
    const steps = drawn.slice(10).map((x, i, all) => (i ? x - all[i - 1] : 0)).slice(1);
    // Nooit terug, en na het aanlopen nooit stil: elke beeldstap schuift het een stukje.
    for (const step of steps) expect(step).toBeGreaterThan(0);
    // En geen trappen: de grootste stap is nog geen twee keer de kleinste van een gelijkmatige sleep.
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(4);
  });

  it('meet de afstand tussen frames: een trage lijn glijdt trager, maar blijft glijden', () => {
    expect(omegaFor(null)).toBe(FOLLOW_OMEGA);
    expect(omegaFor(50)).toBe(FOLLOW_OMEGA_MAX);
    expect(omegaFor(200)).toBe(10);
    expect(omegaFor(5000)).toBe(FOLLOW_OMEGA_MIN);
    const follower = new Follower();
    let now = 0;
    follower.retarget(new Map([['a', { x: 0, y: 0 }]]), ONE, now);
    const drawn: number[] = [];
    let target = 0;
    // Een frame per vijfde seconde (een trage lijn), 60 beelden per seconde, drie seconden lang.
    for (let frame = 0; frame < 180; frame += 1) {
      now = frame * (1000 / 60);
      const due = Math.floor(now / 200) * 40;
      if (due !== target) {
        target = due;
        follower.retarget(new Map([['a', { x: target, y: 0 }]]), ONE, now);
      }
      follower.step(1000 / 60, ONE);
      drawn.push(target + follower.offset('a', ONE).x);
    }
    const steps = drawn.slice(60).map((x, i, all) => (i ? x - all[i - 1] : 0)).slice(1);
    for (const step of steps) expect(step).toBeGreaterThan(-0.01);
    const still = steps.filter((step) => step < 0.05).length;
    expect(still / steps.length).toBeLessThan(0.1);
  });

  it('springt in één keer bij een verhuizing, en vergeet wat verdween', () => {
    const follower = new Follower();
    follower.retarget(new Map([['a', { x: 0, y: 0 }]]), ONE);
    follower.retarget(new Map([['a', { x: FOLLOW_SNAP_PX + 10, y: 0 }]]), ONE);
    expect(follower.offset('a', ONE)).toEqual({ x: 0, y: 0 });
    expect(follower.retarget(new Map(), ONE)).toEqual(['a']);
    expect(follower.ids()).toEqual([]);
  });

  it('meet een verhuizing in schermpixels, niet in de eenheden van het vlak', () => {
    const follower = new Follower();
    const plate = { x: 1000, y: 800 };
    follower.retarget(new Map([['p', { x: 0.1, y: 0.1 }]]), plate);
    follower.retarget(new Map([['p', { x: 0.2, y: 0.1 }]]), plate);
    expect(follower.offset('p', plate).x).toBeCloseTo(-100);
  });

  it('begint een afgebroken sleep bij zijn zaadje, niet op het doel', () => {
    const follower = new Follower();
    follower.seed('a', { x: 40, y: 0 });
    follower.retarget(new Map([['a', { x: 100, y: 0 }]]), ONE);
    expect(follower.offset('a', ONE).x).toBeCloseTo(-60);
    for (let i = 0; i < 120; i += 1) follower.step(16, ONE);
    expect(follower.offset('a', ONE)).toEqual({ x: 0, y: 0 });
    expect(follower.moving()).toBe(false);
  });

  it('schrijft een lege translate als er niets te verschuiven is', () => {
    expect(translateValue({ x: 0, y: 0 })).toBe('');
    expect(translateValue({ x: 1.234, y: -2 })).toBe('1.23px -2px');
  });
});

describe('het zachte slot — wat een ander sleept, pak je niet', () => {
  it('is alleen wat in een `m` staat, nooit de eigen tab', () => {
    const locks = heldLocks([hand('b', { k1: [1, 2] }), hand('me', { k2: [0, 0] })], 'me');
    expect([...locks.keys()]).toEqual(['k1']);
    expect(locks.get('k1')).toMatchObject({ clientId: 'b', name: 'b' });
  });

  it('twee handen aan één ding: overal dezelfde winnaar', () => {
    expect(winsTie('a', 'b')).toBe(true);
    expect(winsTie('b', 'a')).toBe(false);
    const one = heldLocks([hand('b', { k: [0, 0] }), hand('a', { k: [1, 1] })]);
    const other = heldLocks([hand('a', { k: [1, 1] }), hand('b', { k: [0, 0] })]);
    expect(one.get('k')?.clientId).toBe('a');
    expect(other.get('k')?.clientId).toBe('a');
  });

  it('wie het gelijkspel verliest, hoort het; wie het wint niet', () => {
    expect(conflictFor(['k'], [hand('a', { k: [0, 0] })], 'b')).toMatchObject({ id: 'k', lock: { clientId: 'a' } });
    expect(conflictFor(['k'], [hand('b', { k: [0, 0] })], 'a')).toBeNull();
    expect(conflictFor([], [hand('a', { k: [0, 0] })], 'b')).toBeNull();
    expect(conflictFor(['k'], [hand('a', { j: [0, 0] })], 'b')).toBeNull();
  });

  it('heeft klokken die bij elkaar passen', () => {
    // De afzender herhaalt vaker dan de ontvanger opgeeft, en wat losgelaten is wacht niet eeuwig.
    expect(CARRY_KEEPALIVE_MS * 2).toBeLessThan(HAND_STALE_MS);
    expect(SETTLE_MS).toBeGreaterThan(HAND_STALE_MS);
    expect(carries({ m: { a: [0, 0] } })).toBe(true);
    expect(carries({ m: {} })).toBe(false);
    expect(carries(null)).toBe(false);
  });
});

describe('de draag — wat losgelaten is, blijft staan tot het document het zegt', () => {
  const doc = new Map<string, readonly [number, number]>([
    ['k', [0, 0]],
    ['j', [5, 5]],
  ]);
  const docAt = (id: string) => doc.get(id) ?? null;

  it('volgt de hand, en houdt de plek vast als de hand loslaat', () => {
    let carried: ReadonlyMap<string, Carry> = new Map();
    carried = takeHands(carried, [hand('b', { k: [10, 10] })], { now: 1, docAt });
    expect(carried.get('k')).toMatchObject({ x: 10, y: 10, by: 'b', released: null });
    const same = takeHands(carried, [hand('b', { k: [10, 10] })], { now: 2, docAt });
    expect(same).toBe(carried);
    carried = takeHands(carried, [hand('b', {})], { now: 3, docAt });
    expect(carried.get('k')).toMatchObject({ x: 10, y: 10, released: 3, doc: '0,0' });
    // Een hand die helemaal wegviel, laat ook los.
    const gone = takeHands(takeHands(new Map(), [hand('c', { j: [1, 1] })], { now: 1, docAt }), [], { now: 4, docAt });
    expect(gone.get('j')?.released).toBe(4);
  });

  it('ruimt op zodra het document de neerzetting kent, afgerond of niet', () => {
    const carried = takeHands(takeHands(new Map(), [hand('b', { k: [10, 10] })], { now: 1, docAt }), [], { now: 2, docAt });
    // Nog niets veranderd: blijft.
    expect(settleCarry(carried, { now: 3, docAt }).has('k')).toBe(true);
    // Het document zegt precies waar de hand het neerzette.
    expect(settleCarry(carried, { now: 3, docAt: () => [10, 10] }).has('k')).toBe(false);
    // Het document zegt iets anders dan bij het loslaten (de opslag rondde af).
    expect(settleCarry(carried, { now: 3, docAt: () => [11, 10] }).has('k')).toBe(false);
    // Een ander haalde het weg.
    expect(settleCarry(carried, { now: 3, docAt: () => null }).has('k')).toBe(false);
    // En een afgebroken sleep wacht niet eeuwig.
    expect(settleCarry(carried, { now: 2 + SETTLE_MS, docAt }).has('k')).toBe(false);
  });

  it('laat wat nog in de hand is staan, ook als het document al gelijk is', () => {
    const carried = takeHands(new Map(), [hand('b', { k: [0, 0] })], { now: 1, docAt });
    expect(settleCarry(carried, { now: 1 + SETTLE_MS * 2, docAt }).has('k')).toBe(true);
  });

  it('tekent bij twee handen de winnaar', () => {
    const carried = takeHands(new Map(), [hand('b', { k: [1, 1] }), hand('a', { k: [2, 2] })], { now: 1, docAt });
    expect(carried.get('k')).toMatchObject({ by: 'a', x: 2 });
  });
});

describe('de lijn — sneller tijdens een sleep, en de laatste plek gaat altijd mee', () => {
  it('stuurt een dragend frame vaker dan een pijltje', () => {
    expect(POINTER_CARRY_THROTTLE_MS).toBeLessThan(POINTER_THROTTLE_MS);
    expect(pointerWait(true, 0)).toBe(POINTER_CARRY_THROTTLE_MS);
    expect(pointerWait(false, 0)).toBe(POINTER_THROTTLE_MS);
    expect(pointerWait(true, 500)).toBe(0);
  });

  it('LiveProvider stuurt het wachtende dragende frame eerst, en herhaalt het zolang de hand vasthoudt', () => {
    const src = read('components/live/LiveProvider.tsx');
    expect(src).toMatch(/pending && carries\(pending\) && !carries\(incoming\)/);
    expect(src).toMatch(/CARRY_KEEPALIVE_MS/);
    expect(src).toMatch(/HAND_STALE_MS/);
  });
});

describe('de stamboom — een verplaatsing zet niemand terug', () => {
  const NOW = 1_700_000_000_000;
  const buried = normaliseTreeState(
    { ...emptyTreeState(), deleted: { members: { e1: NOW - 1000 }, loose: {}, ties: {} } },
    NOW,
  );

  it('laat een kaartje dat hier werd gesleept terwijl een ander het weghaalde, weg', () => {
    const { state } = mergeTreeState(buried, { members: [{ id: 'e1', updatedAt: NOW }], revive: {} }, NOW);
    expect(stateEntryIds(state)).toEqual([]);
    expect(state.deleted.members.e1).toBe(NOW - 1000);
  });

  it('zet terug wat deze hand er met opzet terugzette', () => {
    const { state } = mergeTreeState(buried, { members: [{ id: 'e1', updatedAt: NOW }], revive: { members: ['e1'] } }, NOW);
    expect(stateEntryIds(state)).toEqual(['e1']);
  });

  it('kent zonder `revive` de oude regel, en slikt rommel', () => {
    expect(stateEntryIds(mergeTreeState(buried, { members: [{ id: 'e1', updatedAt: NOW }] }, NOW).state)).toEqual(['e1']);
    const junk = { members: 5 } as unknown as { members: string[] };
    expect(() => mergeTreeState(buried, { members: [{ id: 'e1', updatedAt: NOW }], revive: junk }, NOW)).not.toThrow();
  });
});

describe('de woorden en de vier vlakken', () => {
  it('heeft een groep met drie zinnen, elk met {naam}, en kort genoeg', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'Samen op een vlak (golf M)');
    expect(group?.words.map((w) => w.key)).toEqual(['liveHeldBy', 'liveTakenFirst', 'liveGoneByOther']);
    for (const key of ['liveHeldBy', 'liveTakenFirst', 'liveGoneByOther']) {
      expect(DEFAULT_WORDS[key]).toContain('{naam}');
      expect(DEFAULT_WORDS[key].length).toBeLessThanOrEqual(WORD_MAX);
    }
  });

  it.each([
    'components/boards/BoardCanvas.tsx',
    'components/maps/MapCanvas.tsx',
    'components/timelines/TimelineCanvas.tsx',
    'components/families/FamilyTreeCanvas.tsx',
  ])('%s volgt, sluit en geeft op', (file) => {
    const src = read(file);
    expect(src).toMatch(/useFollow\(/);
    expect(src).toMatch(/useDragConflict\(/);
    expect(src).toMatch(/liveHeldBy/);
    expect(src).toMatch(/data-follow=\{`hand:\$\{pointer\.clientId\}`\}/);
  });

  it('geen CSS-overgang meer op wat een ander draagt — twee easings op één ding vechten', () => {
    const css = ['app/globals.css', 'app/timelines.css', 'app/stambomen.css'].map(read).join('\n');
    expect(css).not.toMatch(/transition:\s*left 70ms linear/);
    expect(css).not.toMatch(/\.tree-node\.is-carried\s*\{[^}]*transition:\s*transform/);
  });

  it('de tijdlijn zegt nu ook wat hij vasthoudt', () => {
    expect(read('components/timelines/TimelineCanvas.tsx')).toMatch(/setLiveHolding\(/);
  });
});
