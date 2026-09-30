import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ICON_PATHS } from '@/components/Icon';
import { iconClashes, SOORT_ICONEN } from '@/lib/beheer';
import { BORDER_KEYS, BORDER_LABELS } from '@/lib/borders.mjs';
import { ENTRY_TYPES, GOLF_L_RANDEN, GOLF_L_TEKENS } from '@/lib/db/seed.mjs';
import { MERK_APPLE, MERK_ICON } from '@/lib/merk';

/**
 * Golf L: de tekens. Een index van elke vorm op de site, en wat eruit volgde:
 * de zwakke iconen opnieuw getekend, zestien nieuwe, geen soort meer met het
 * teken van een andere, vier randen voor het pantheon, een merk voor het
 * archief, en een kurk dat het token van de Keeper eindelijk leest.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

type Soort = { slug: string; label: string; icon: string; border: string };
const SEEDED = ENTRY_TYPES as Soort[];
const NIEUW = [
  'star',
  'moon',
  'leaf',
  'tentacle',
  'rune',
  'chalice',
  'crown',
  'sword',
  'bottle',
  'quill',
  'speech',
  'wave',
  'ship',
  'fish',
  'church',
  'bell',
];

describe('golf L: de iconen', () => {
  it('tekent elk nieuw teken, en zet het in de kiezer met een Nederlandse naam', () => {
    const names = SOORT_ICONEN.map((option) => option.name);
    for (const name of NIEUW) {
      expect(ICON_PATHS[name], name).toBeTruthy();
      expect(names, name).toContain(name);
    }
    for (const option of SOORT_ICONEN) expect(option.label, option.name).toMatch(/^[A-Z][a-z]+$/);
    expect(new Set(SOORT_ICONEN.map((option) => option.label)).size).toBe(SOORT_ICONEN.length);
  });

  it('houdt het merk uit de kiezer: het is het teken van het archief, niet van een soort', () => {
    expect(ICON_PATHS.merk).toBeTruthy();
    expect(SOORT_ICONEN.map((option) => option.name)).not.toContain('merk');
  });

  it('geeft geen twee soorten van de seed hetzelfde teken meer (D17 gesloten)', () => {
    expect(iconClashes(SEEDED)).toEqual([]);
  });

  it('verhuist alleen van het oude naar het nieuwe teken, en de seed draagt het nieuwe al', () => {
    for (const [slug, from, to] of GOLF_L_TEKENS as [string, string, string][]) {
      const soort = SEEDED.find((type) => type.slug === slug);
      expect(soort, slug).toBeTruthy();
      expect(soort?.icon, slug).toBe(to);
      expect(from).not.toBe(to);
      expect(ICON_PATHS[from], from).toBeTruthy();
    }
  });

  it('tekent de prikborden als punaises met een draad, niet als een beeldscherm', () => {
    // Twee koppen (cirkels) en een draad: de vorm die de rest van de site al kent.
    expect(ICON_PATHS.board).toContain('a1.2 1.2');
    expect(ICON_PATHS.board).not.toContain('M12 17v3M8 20h8');
  });
});

describe('golf L: de randen', () => {
  it('heeft een woord en een regel voor elke rand', () => {
    const css = read('app/globals.css') + read('app/tekens.css');
    const labels = BORDER_LABELS as Record<string, string>;
    for (const key of BORDER_KEYS as string[]) {
      expect(labels[key], key).toBeTruthy();
      expect(css, key).toContain(`.brd-${key} {`);
    }
    for (const key of ['sigil', 'tide', 'burnt', 'seal']) expect(BORDER_KEYS).toContain(key);
  });

  it('geeft het pantheon vier eigen randen, en de Abnormaliteiten houden Gearceerd', () => {
    const border = (slug: string) => SEEDED.find((type) => type.slug === slug)?.border;
    expect(border('abnormality')).toBe('frame');
    const naar = new Set<string>();
    for (const [slug, from, to] of GOLF_L_RANDEN as [string, string, string][]) {
      expect(from).toBe('frame');
      expect(border(slug), slug).toBe(to);
      naar.add(to);
    }
    expect(naar.size).toBe(GOLF_L_RANDEN.length);
  });

  it('legt het zegel rechtsboven: rechtsonder zit op het prikbord de greep', () => {
    const css = read('app/tekens.css');
    const seal = css.slice(css.indexOf('.brd-seal::after {'), css.indexOf('}', css.indexOf('.brd-seal::after {')));
    expect(seal).toContain('top:');
    expect(seal).toContain('right:');
    expect(seal).not.toContain('bottom:');
    expect(seal).toContain('pointer-events: none');
  });
});

describe('golf L: het kurk (sinds golf N: het vlak)', () => {
  const css = read('app/tekens.css');

  it('golf N: het vlak is één rustige kleur uit het kurk en het papier, zonder tegel', () => {
    const before = css.slice(css.indexOf('.board-viewport::before {'), css.indexOf('.cork-swatch {'));
    expect(before).toContain('var(--board-lamp)');
    expect(before).toContain('var(--board-shade)');
    expect(before).toContain('pointer-events: none');
    expect(before).toContain('z-index: -1');
    // Geen herhaling: de enige afbeelding is ruis over het hele glas, niet een tegel.
    expect(before).toContain('feTurbulence');
    expect(before).toContain('100% 100% no-repeat');
    expect(before).not.toMatch(/\d+px \d+px \/ \d+px \d+px/);
    expect(css).toMatch(/--board-surface: color-mix\(in srgb, var\(--cork\) \d+%, var\(--paper\)\)/);
    // De oude tegel met de vaste kleur staat er niet meer overheen.
    expect(css).toMatch(/\.board-viewport \{[^}]*background-image: none/);
    expect(css).toMatch(/\.board-viewport \{[^}]*isolation: isolate/);
  });

  it('doet de lamp alleen in het donker aan, in beide donkere kiezers', () => {
    expect(css).toMatch(/:root \{[^}]*--board-lamp: transparent/);
    expect(css).toMatch(/:root:has\(\[data-theme='dark'\]\) \{[^}]*--board-lamp: rgb/);
    expect(css).toMatch(
      /prefers-color-scheme: dark\)[^@]*:root:not\(:has\(\[data-theme='light'\]\)\) \{[^}]*--board-lamp: rgb/,
    );
  });

  it('laat de punaise even groot: een draad vertrekt nog uit hetzelfde midden', () => {
    const pin = css.slice(css.indexOf('.board-pin,\n.cork-swatch-pin {'), css.indexOf('.cork-swatch-pin {'));
    expect(pin).not.toMatch(/\b(width|height|left|top|margin)\s*:/);
  });

  it('is een laag na beheer.css', () => {
    const layout = read('app/layout.tsx');
    expect(layout.indexOf("import './tekens.css'")).toBeGreaterThan(layout.indexOf("import './beheer.css'"));
  });
});

describe('golf L: het merk', () => {
  it('is in de tab hetzelfde teken als in de zijbalk', () => {
    const svg = read(`public${MERK_ICON}`);
    expect(svg).toContain(`d="${ICON_PATHS.merk}"`);
    expect(readFileSync(join(ROOT, `public${MERK_APPLE}`)).subarray(1, 4).toString()).toBe('PNG');
  });

  it('staat buiten de inlog, en een eigen icoontje gaat voor (§88)', () => {
    const middleware = read('middleware.ts');
    expect(middleware).toContain('merk.svg');
    expect(middleware).toContain('merk-180.png');
    const layout = read('app/layout.tsx');
    expect(layout).toMatch(/site\.iconUrl\s*\?\s*\{ icon: site\.iconUrl/);
    expect(layout).toContain('MERK_ICON');
  });
});

describe('golf L: een archief dat de oude tekens nog heeft', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zcf-golf-l-'));
  process.env.DATA_DIR = dir;
  let sqlite: typeof import('@/lib/db').sqlite;
  let seedBaseline: typeof import('@/lib/db/seed.mjs').seedBaseline;
  const MARKER = 'seed:golf-l-tekens';

  const row = (slug: string) =>
    sqlite.prepare('SELECT icon, border FROM entry_types WHERE slug = ?').get(slug) as {
      icon: string;
      border: string;
    };

  beforeAll(async () => {
    sqlite = (await import('@/lib/db')).sqlite;
    seedBaseline = (await import('@/lib/db/seed.mjs')).seedBaseline;
  });
  afterAll(() => {
    sqlite?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('krijgt de nieuwe tekens, behalve waar de Keeper zelf koos', () => {
    // Zoals het archief er vóór golf L uitzag, op één soort na die de Keeper
    // al een eigen teken en een eigen rand gaf.
    sqlite.prepare('DELETE FROM schema_migrations WHERE name = ?').run(MARKER);
    const setIcon = sqlite.prepare('UPDATE entry_types SET icon = ? WHERE slug = ?');
    const setBorder = sqlite.prepare('UPDATE entry_types SET border = ? WHERE slug = ?');
    for (const [slug, from] of GOLF_L_TEKENS as [string, string, string][]) setIcon.run(from, slug);
    for (const [slug, from] of GOLF_L_RANDEN as [string, string, string][]) setBorder.run(from, slug);
    setIcon.run('moon', 'kosmische-goden');
    setBorder.run('double', 'kosmische-goden');

    seedBaseline(sqlite);

    expect(row('object').icon).toBe('chalice');
    expect(row('eldritch-entiteiten')).toEqual({ icon: 'tentacle', border: 'burnt' });
    expect(row('aardse-goden')).toEqual({ icon: 'leaf', border: 'tide' });
    expect(row('kosmische-goden')).toEqual({ icon: 'moon', border: 'double' });
  });

  it('doet dat één keer: wie daarna terugzet, houdt wat hij terugzette', () => {
    sqlite.prepare("UPDATE entry_types SET icon = 'badge' WHERE slug = 'object'").run();
    seedBaseline(sqlite);
    expect(row('object').icon).toBe('badge');
  });
});
