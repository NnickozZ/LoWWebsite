import { describe, expect, it } from 'vitest';
import {
  dropDanglingOpeners,
  placeSuggestList,
  previewSegments,
  previewWorth,
  type ShortSpan,
  type View,
} from '@/lib/editor/shortBox';

/**
 * §92, ronde 53 — de korte vakken. De drie pure stukken onder c+:
 * een losse `[[` die bij het verlaten wegvalt (A4), de voorvertoning van een
 * vak buiten focus (A1), en waar de lijst met namen hangt (A5).
 */

function span(start: number, end: number, name: string, entryId: string | null = 'e1'): ShortSpan {
  return { start, end, name, entryId, slug: entryId ? 'slug' : null, icon: null, colour: null };
}

describe('dropDanglingOpeners (A4)', () => {
  it('haalt de haakjes van een half getypte naam af', () => {
    expect(dropDanglingOpeners('en [[Jac')).toBe('en Jac');
  });

  it('laat een echte vermelding staan', () => {
    expect(dropDanglingOpeners('Zie [[Jan]] hier')).toBe('Zie [[Jan]] hier');
    expect(dropDanglingOpeners('[[A]] en [[B')).toBe('[[A]] en B');
  });

  it('kijkt niet over een regel heen, en niet voorbij de volgende [[', () => {
    expect(dropDanglingOpeners('[[A\nB]]')).toBe('A\nB]]');
    expect(dropDanglingOpeners('[[[[A]]')).toBe('[[A]]');
    expect(dropDanglingOpeners('[[x [[Jan]]')).toBe('x [[Jan]]');
  });

  it('laat een @ en tekst zonder haakjes ongemoeid', () => {
    expect(dropDanglingOpeners('mail @Jan, of piet@example.nl')).toBe('mail @Jan, of piet@example.nl');
    expect(dropDanglingOpeners('')).toBe('');
    expect(dropDanglingOpeners('gewoon ] ]] tekst')).toBe('gewoon ] ]] tekst');
  });
});

describe('previewSegments (A1, c+)', () => {
  it('toont een vermelding als chip, zonder haakjes, en weet waar hij in de ruwe tekst staat', () => {
    const text = 'Zie [[Jan]] en @Piet.';
    const segments = previewSegments(text, [span(4, 11, 'Jan'), span(15, 20, 'Piet')]);
    expect(segments.map((s) => s.kind)).toEqual(['text', 'chip', 'text', 'chip', 'text']);
    expect(segments[1]).toMatchObject({ raw: 4, rawEnd: 11 });
    expect(previewWorth(segments)).toBe(true);
  });

  it('haalt de haakjes er al af terwijl het antwoord nog onderweg is', () => {
    const segments = previewSegments('Zie [[Jan]] hier', null);
    expect(segments).toEqual([
      { kind: 'text', text: 'Zie ', raw: 0, rawEnd: 4 },
      { kind: 'pending', text: 'Jan', raw: 4, rawEnd: 11 },
      { kind: 'text', text: ' hier', raw: 11, rawEnd: 16 },
    ]);
  });

  it('laat een span vallen die niet meer klopt met de letters', () => {
    const segments = previewSegments('Zie [[Jans]] hier', [span(4, 11, 'Jan')]);
    expect(previewWorth(segments)).toBe(false);
    expect(segments.map((s) => (s.kind === 'text' ? s.text : '')).join('')).toBe('Zie [[Jans]] hier');
  });

  it('een tekst zonder vermelding heeft niets te laten zien', () => {
    expect(previewWorth(previewSegments('piet@example.nl', []))).toBe(false);
  });
});

describe('placeSuggestList (A5)', () => {
  const phone: View = { left: 0, top: 0, width: 390, height: 844, layoutHeight: 844 };

  it('hangt onder het vak als daar ruimte is', () => {
    const place = placeSuggestList({ left: 16, top: 200, bottom: 240, width: 358 }, phone);
    expect(place.up).toBe(false);
    expect(place.top).toBe(244);
    expect(place.maxHeight).toBe(260);
  });

  it('klapt om als het toetsenbord de ruimte eronder inneemt', () => {
    // 390×500: het toetsenbord bedekt de onderste 344 px.
    const keyboard: View = { ...phone, height: 500 };
    const place = placeSuggestList({ left: 16, top: 360, bottom: 400, width: 358 }, keyboard);
    expect(place.up).toBe(true);
    expect(place.bottom).toBe(844 - 360 + 4);
    // Past boven het vak, binnen het zichtbare deel.
    expect(place.maxHeight).toBeLessThanOrEqual(360 - 4 - 8);
  });

  it('meet tegen het zichtbare deel, ook als dat verschoven is', () => {
    const scrolled: View = { left: 0, top: 300, width: 390, height: 500, layoutHeight: 844 };
    const place = placeSuggestList({ left: 16, top: 320, bottom: 360, width: 358 }, scrolled);
    expect(place.up).toBe(false);
    expect(place.maxHeight).toBeLessThanOrEqual(300 + 500 - 360 - 4 - 8);
  });

  it('blijft binnen het scherm en is minstens 260 breed', () => {
    const place = placeSuggestList({ left: 300, top: 100, bottom: 130, width: 80 }, phone);
    expect(place.width).toBe(260);
    expect(place.left + place.width).toBeLessThanOrEqual(390 - 8);
  });

  it('doet wat SuggestionPopup deed voor een caret met genoeg ruimte', () => {
    const desktop: View = { left: 0, top: 0, width: 1440, height: 900, layoutHeight: 900 };
    const place = placeSuggestList({ left: 500, top: 300, bottom: 320, width: 0 }, desktop, {
      gap: 6,
      minWidth: 320,
      maxWidth: 320,
    });
    expect(place).toMatchObject({ up: false, top: 326, left: 500, width: 320 });
  });
});
