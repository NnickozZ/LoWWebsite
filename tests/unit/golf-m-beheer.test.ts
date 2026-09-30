import { describe, expect, it } from 'vitest';
import { renderSample, spelerPast, spelerTellingen } from '@/lib/beheer';
import { DEFAULT_WORDS } from '@/lib/words';

const bram = { username: 'Bram', isKeeper: false, isDisabled: false, character: 'Van Dijk', characters: [{ name: 'Van Dijk' }, { name: 'Zoë Mulder' }] };
const kees = { username: 'kees', isKeeper: true, isDisabled: false, character: null, characters: [] };
const piet = { username: 'Piet', isKeeper: false, isDisabled: true };

describe('golf M (C3): zoeken in Beheer → Gebruikers', () => {
  it('vindt op de accountnaam, zonder hoofdletters', () => {
    expect(spelerPast(bram, 'bram')).toBe(true);
    expect(spelerPast(kees, 'KEE')).toBe(true);
    expect(spelerPast(piet, 'bram')).toBe(false);
  });

  it('vindt op het karakter dat hij speelt en op elk karakter dat hij heeft, zonder accenten', () => {
    expect(spelerPast(bram, 'dijk')).toBe(true);
    expect(spelerPast(bram, 'zoe')).toBe(true);
    expect(spelerPast(bram, 'mülder')).toBe(true);
  });

  it('eist elk getypt woord, ergens in de rij', () => {
    expect(spelerPast(bram, 'bram dijk')).toBe(true);
    expect(spelerPast(bram, 'bram kees')).toBe(false);
  });

  it('een leeg vak laat iedereen staan', () => {
    expect(spelerPast(piet, '   ')).toBe(true);
  });

  it('de filterknoppen: Keepers en Uitgeschakeld', () => {
    expect(spelerPast(kees, '', 'keepers')).toBe(true);
    expect(spelerPast(bram, '', 'keepers')).toBe(false);
    expect(spelerPast(piet, '', 'uit')).toBe(true);
    expect(spelerPast(kees, '', 'uit')).toBe(false);
    expect(spelerPast(piet, 'kees', 'uit')).toBe(false);
  });

  it('telt per knop over de hele lijst', () => {
    expect(spelerTellingen([bram, kees, piet])).toEqual({ alle: 3, keepers: 1, uit: 1 });
  });

  it('de telling leest in Woorden met een voorbeeld op elk gat', () => {
    expect(renderSample(DEFAULT_WORDS.spelersTelling, DEFAULT_WORDS)).toBe('3 van 12');
    expect(renderSample(DEFAULT_WORDS.spelersZoek, DEFAULT_WORDS)).not.toContain('{');
  });
});
