import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentDoor, jijIsHere } from '@/components/shell/jouwPlekPad';
import { skeletonShapeFor } from '@/components/shell/skeletonShape';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * Golf h1 — de schil, de pure helften. Het gedrag in de browser staat in
 * `tests/e2e/golf-h1-schil.spec.ts`.
 */

const ROOT = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('D18: één actief vakje in jouw plek', () => {
  const doors = ['/kamer/vera', '/winkel?kamer=r1', '/spelers/vera', '/spelers'];

  it('laat de langste overeenkomst winnen', () => {
    expect(currentDoor('/spelers/vera', doors)).toBe('/spelers/vera');
    expect(currentDoor('/spelers', doors)).toBe('/spelers');
    expect(currentDoor('/spelers/kees', doors)).toBe('/spelers');
    expect(currentDoor('/winkel', doors)).toBe('/winkel?kamer=r1');
    expect(currentDoor('/wiki', doors)).toBeNull();
  });
});

describe('T7: de Jij-tab is actief in jouw plek', () => {
  it('op kamer, winkel, de hal, een spelerspagina en /you', () => {
    for (const path of ['/kamer/vera', '/winkel', '/spelers', '/spelers/kees', '/you']) expect(jijIsHere(path), path).toBe(true);
    for (const path of ['/', '/wiki', '/kamers', '/winkelier', '/spelersx', '/e/kees']) expect(jijIsHere(path), path).toBe(false);
  });

  it('elke tabpagina heeft een skelet', () => {
    for (const path of ['/', '/cases', '/wiki', '/boards', '/maps', '/timelines', '/spelers']) {
      expect(skeletonShapeFor(path), path).not.toBeNull();
    }
  });
});

describe('D4: de Keeperkant in de mast', () => {
  const globals = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('heeft geen strook en geen 12 rem meer voor een knop in de hoek op een computer', () => {
    expect(globals).not.toMatch(/--main-pad-t:\s*calc\(0\.4rem \+ var\(--tap\)/);
    expect(globals).not.toMatch(/padding-right:\s*12rem/);
  });

  it('houdt de knop in de hoek voor de telefoon, en de strook komt van de server', () => {
    expect(globals).toMatch(/\.shell\[data-keeper-hand\]/);
    const shell = read('components/AppShell.tsx');
    expect(shell).toMatch(/data-keeper-hand=/);
    expect(shell).toMatch(/variant="mast"/);
  });

  it('heeft woorden voor de twee helften', () => {
    expect(DEFAULT_WORDS.sideSwitchPlayers).toBe('Spelers');
    expect(DEFAULT_WORDS.sideSwitchKeeper).toBe('Keeper');
  });
});

describe('D2: een onbekend adres is een 404 in de schil', () => {
  it('heeft een catch-all die eerst om een kijker vraagt en dan niets vindt', () => {
    const page = read('app/(app)/[...rest]/page.tsx');
    expect(page).toMatch(/await requireViewer\(\);\s*notFound\(\);/);
  });
});

describe('D25, T24, T18: de zinnen', () => {
  it('zegt wat er niet gevonden is, en wat Enter dan doet', () => {
    expect(fill(DEFAULT_WORDS.paletteNothingFor, { zoek: 'zzqx' })).toBe('Niets gevonden voor ‘zzqx’ — Enter zoekt in alles');
    expect(fill(DEFAULT_WORDS.paletteNoActionFor, { zoek: 'zzqx' })).toBe('Geen handeling heet ‘zzqx’.');
  });

  it('noemt geen toets op een aanraakscherm', () => {
    expect(DEFAULT_WORDS.searchHintTouch).not.toMatch(/\//);
    expect(DEFAULT_WORDS.canvasHintTouch).not.toMatch(/Ctrl|scroll|Esc/i);
  });
});

describe('T2: geen blauwe tikflits', () => {
  it('zet de flits uit en geeft de tabs een eigen hand', () => {
    const nav = read('app/navigatie.css');
    expect(nav).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(nav).toMatch(/\.tabs a:active,\s*\.tabs > \.tab-jij:active\s*\{/);
  });
});
