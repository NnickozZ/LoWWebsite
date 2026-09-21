import { describe, expect, it } from 'vitest';
import { gateAsks, isTypable } from '@/lib/canvas/authorGate';
import { ADMIN_FIRST, orderPanes } from '@/lib/adminTabOrder';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §90, ronde 51 (canvas): de pure helften van wat er op de tekenvlakken en in
 * Beheer veranderde.
 */

/** A stand-in for a DOM element: what `gateAsks` reads, and nothing else. */
function el(
  props: Partial<{ tagName: string; type: string; readOnly: boolean; disabled: boolean; isContentEditable: boolean }>,
  insideOff = false,
) {
  return {
    ...props,
    closest: (selector: string) => (insideOff && selector === '[data-author-gate="off"]' ? {} : null),
  } as unknown as EventTarget;
}

describe('§90 de schrijfvraag op een tekenvlak', () => {
  const paper = el({ tagName: 'DIV' });
  const text = el({ tagName: 'TEXTAREA' });
  const box = el({ tagName: 'INPUT', type: 'text' });

  it('vraagt niets bij een tik op het glas in Lezen', () => {
    expect(gateAsks(false, paper)).toBe(false);
    expect(gateAsks(false, el({ tagName: 'BUTTON' }))).toBe(false);
    expect(gateAsks(false, null)).toBe(false);
  });

  it('vraagt het in Bewerken bij elke aanraking, zoals voorheen', () => {
    expect(gateAsks(true, paper)).toBe(true);
    expect(gateAsks(true, el({ tagName: 'BUTTON' }))).toBe(true);
  });

  it('vraagt het in Lezen alleen voor een vak waarin je echt typt', () => {
    expect(gateAsks(false, text)).toBe(true);
    expect(gateAsks(false, box)).toBe(true);
    expect(gateAsks(false, el({ isContentEditable: true }))).toBe(true);
    // Not a box you type in: a read-only one, a disabled one, a tick.
    expect(gateAsks(false, el({ tagName: 'INPUT', type: 'text', readOnly: true }))).toBe(false);
    expect(gateAsks(false, el({ tagName: 'TEXTAREA', disabled: true }))).toBe(false);
    expect(gateAsks(false, el({ tagName: 'INPUT', type: 'checkbox' }))).toBe(false);
  });

  it('vraagt nooit onder data-author-gate="off" — de legenda, de camera, de schakelaar', () => {
    expect(gateAsks(false, el({ tagName: 'INPUT', type: 'text' }, true))).toBe(false);
    expect(gateAsks(true, el({ tagName: 'INPUT', type: 'text' }, true))).toBe(false);
    expect(gateAsks(true, el({ tagName: 'BUTTON' }, true))).toBe(false);
  });

  it('kent een typvak', () => {
    expect(isTypable(el({ tagName: 'input' }))).toBe(true);
    expect(isTypable(el({ tagName: 'INPUT', type: 'search' }))).toBe(true);
    expect(isTypable(el({ tagName: 'INPUT', type: 'radio' }))).toBe(false);
    expect(isTypable(el({ tagName: 'SELECT' }))).toBe(false);
    expect(isTypable(null)).toBe(false);
  });
});

describe('§90 de tabbladen van Beheer', () => {
  const page = ['users', 'review', 'types', 'words', 'colours', 'trash', 'history', 'site', 'export', 'audit'].map(
    (key) => ({ key }),
  );

  it('zet Gebruikers, Beoordelen en Prullenbak vooraan', () => {
    expect(orderPanes(page).slice(0, 3).map((p) => p.key)).toEqual(ADMIN_FIRST);
  });

  it('laat de rest in de volgorde van de pagina', () => {
    expect(orderPanes(page).slice(3).map((p) => p.key)).toEqual([
      'types',
      'words',
      'colours',
      'history',
      'site',
      'export',
      'audit',
    ]);
  });

  it('verliest niets en maakt niets bij', () => {
    expect(orderPanes(page)).toHaveLength(page.length);
    expect(orderPanes([{ key: 'site' }, { key: 'trash' }]).map((p) => p.key)).toEqual(['trash', 'site']);
    expect(orderPanes([])).toEqual([]);
  });
});

describe('§90 de nieuwe zinnen', () => {
  it('houden hun gaten', () => {
    expect(DEFAULT_WORDS.boardEmptyRead).toContain('{prikbord}');
    expect(DEFAULT_WORDS.boardEmptyFind).toContain('{artikel}');
    expect(DEFAULT_WORDS.boardEmptyMake).toContain('{notitie}');
    expect(DEFAULT_WORDS.boardEmptyMake).toContain('{punaise}');
    expect(DEFAULT_WORDS.boardEmptyString).toContain('{draad}');
    expect(DEFAULT_WORDS.keeperPromoteTitle).toContain('{naam}');
    expect(DEFAULT_WORDS.keeperPromoteMessage).toContain('{keeperkant}');
    expect(DEFAULT_WORDS.adminNewPasswordFor).toContain('{naam}');
  });

  it('passen in de 60 tekens die Beheer → Woorden bewaart', () => {
    // `cleanWordOverrides` knipt een eigen woord op 60 af, dus een zin die
    // langer is zou de Keeper nooit helemaal kunnen herschrijven.
    for (const key of [
      'boardEmptyRead',
      'boardEmptyFind',
      'boardEmptyMake',
      'boardEmptyString',
      'keeperPromoteTitle',
      'keeperPromoteMessage',
      'keeperPromoteYes',
      'adminNewPasswordFor',
      'trashTypeName',
    ]) {
      expect(DEFAULT_WORDS[key].length, key).toBeLessThanOrEqual(60);
    }
  });

  it('heeft de spaties rond de punaise die de JSX-regelbreuk opat', () => {
    const vars = { artikel: 'artikel', notitie: 'notitie', punaise: 'punaise', draad: 'draad', kaart: 'kaart' };
    const line = [DEFAULT_WORDS.boardEmptyFind, DEFAULT_WORDS.boardEmptyMake, DEFAULT_WORDS.boardEmptyString]
      .map((w) => fill(w, vars))
      .join(' ');
    expect(line).not.toMatch(/eenpunaise|punaisein/);
    expect(line).toContain('een punaise');
  });
});
