import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '@/components/Icon';
import { ADMIN_FIRST } from '@/lib/adminTabOrder';
import {
  ADMIN_WHAT_KEY,
  HOLE_WORD,
  SOORT_ICONEN,
  SOORT_KLEUREN,
  FIELD_KIND_SHORT,
  choicelessFields,
  countTypeChanges,
  droppedHoles,
  fieldHasMore,
  holesOf,
  iconClashes,
  makePassword,
  namelessFields,
  othersWithIcon,
  renderSample,
  wordContext,
  zonderParagraaf,
  type SoortStaat,
} from '@/lib/beheer';
import { FIELD_KINDS } from '@/lib/fieldKinds';
import { WORD_GROUPS } from '@/lib/words';
import { DEFAULT_WORDS, WORD_MAX } from '@/lib/words';
import { ENTRY_TYPES } from '@/lib/db/seed.mjs';

/**
 * §107 (golf i3): Beheer voor de Keeper. De pure helften van de soort-editor,
 * Woorden, de index op de telefoon en het wachtwoord-blad.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('D17: dubbele pictogrammen worden gemeld, niet geweigerd', () => {
  const seeded = (ENTRY_TYPES as { slug: string; label: string; icon: string }[]).map((type) => ({
    slug: type.slug,
    label: type.label,
    icon: type.icon,
  }));

  it('rapporteert per pictogram welke soorten van de seed het delen', () => {
    const clashes = iconClashes(seeded);
    // Een rapport: de lijst staat in de uitvoer, en de test faalt er niet op.
    console.info(
      '[D17] soorten met hetzelfde pictogram:',
      clashes.map((clash) => `${clash.icon}: ${clash.labels.join(' + ')}`).join(' · ') || 'geen',
    );
    for (const clash of clashes) expect(clash.labels.length).toBeGreaterThan(1);
    // De vorm klopt ook zonder dubbelen.
    expect(iconClashes([{ slug: 'a', label: 'A', icon: 'pin' }])).toEqual([]);
  });

  it('noemt de andere soorten met hetzelfde teken, niet de soort zelf', () => {
    const types = [
      { slug: 'a', label: 'Aardse Goden', icon: 'pin' },
      { slug: 'b', label: 'Locaties', icon: 'pin' },
      { slug: 'c', label: 'Talen', icon: 'book' },
    ];
    expect(othersWithIcon(types, 'a', 'pin')).toEqual(['Locaties']);
    expect(othersWithIcon(types, 'a', 'mountain')).toEqual([]);
    expect(iconClashes(types)).toEqual([{ icon: 'pin', labels: ['Aardse Goden', 'Locaties'] }]);
  });

  it('elk pictogram in de kiezer en in de seed bestaat, en de vier gevraagde zijn erbij', () => {
    const names = SOORT_ICONEN.map((option) => option.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(ICON_PATHS[name], name).toBeTruthy();
    for (const type of seeded) expect(ICON_PATHS[type.icon], type.icon).toBeTruthy();
    for (const name of ['mountain', 'gem', 'ghost', 'scroll']) expect(names).toContain(name);
    // Elk seed-pictogram staat in de kiezer, dus een soort kan altijd terug naar wat hij had.
    for (const type of seeded) expect(names, type.icon).toContain(type.icon);
  });

  it('de kleuren zijn zes hex-cijfers en uniek', () => {
    for (const colour of SOORT_KLEUREN) expect(colour).toMatch(/^#[0-9A-F]{6}$/i);
    expect(new Set(SOORT_KLEUREN.map((c) => c.toLowerCase())).size).toBe(SOORT_KLEUREN.length);
  });
});

describe('de soort-editor telt wat nog niet bewaard is', () => {
  const base: SoortStaat = {
    label: 'Schepen',
    slug: 'schepen',
    icon: 'anchor',
    colour: '#31556B',
    border: 'solid',
    prefixDefault: false,
    keeperMade: false,
    oneOfAKind: false,
    fields: [
      { key: 'tonnage', label: 'Tonnage', kind: 'number' },
      { key: 'haven', label: 'Thuishaven', kind: 'entry_link', ofType: ['location'] },
    ],
    blocks: [{ id: 'b', kind: 'body' }],
    pageText: {},
  };

  it('niets veranderd is nul', () => {
    expect(countTypeChanges(base, { ...base, fields: [...base.fields] })).toBe(0);
  });

  it('één per eigenschap, één per veld', () => {
    expect(countTypeChanges(base, { ...base, icon: 'tower', colour: '#1F4E79' })).toBe(2);
    expect(
      countTypeChanges(base, {
        ...base,
        fields: [...base.fields, { key: 'bouwjaar', label: 'Bouwjaar', kind: 'date' }],
      }),
    ).toBe(1);
    expect(
      countTypeChanges(base, {
        ...base,
        fields: [{ ...base.fields[0], label: 'Tonnen' }, base.fields[1]],
      }),
    ).toBe(1);
    // Omhoog schuiven verandert twee plaatsen.
    expect(countTypeChanges(base, { ...base, fields: [base.fields[1], base.fields[0]] })).toBe(2);
    expect(countTypeChanges(base, { ...base, blocks: [], pageText: { newButton: 'Nieuw schip' } })).toBe(2);
    // Witruimte om een adres is geen verandering.
    expect(countTypeChanges(base, { ...base, slug: ' schepen ' })).toBe(0);
  });

  it('een veld zonder naam valt weg bij opslaan, en de voet zegt het', () => {
    expect(namelessFields(base.fields)).toBe(0);
    expect(namelessFields([...base.fields, { key: 'veld_3', label: '  ', kind: 'text' }])).toBe(1);
  });

  it('alleen keuzelijsten en koppelingen hebben een uitklap', () => {
    expect(fieldHasMore('select')).toBe(true);
    expect(fieldHasMore('multiselect')).toBe(true);
    expect(fieldHasMore('entry_link')).toBe(true);
    expect(fieldHasMore('entry_links')).toBe(true);
    expect(fieldHasMore('text')).toBe(false);
    expect(fieldHasMore('date')).toBe(false);
  });
});

describe('Woorden: in context', () => {
  it('leest de gaten van een zin', () => {
    expect(holesOf('Nog {n} nodig voor {ding}, nog {n}')).toEqual(['n', 'ding']);
  });

  it('zegt het als een gat verdwijnt, en niet als het blijft of het vak leeg is', () => {
    expect(droppedHoles('Nog {n} nodig', 'Nog even geduld')).toEqual(['n']);
    expect(droppedHoles('Nog {n} nodig', 'Je mist er {n}')).toEqual([]);
    expect(droppedHoles('Nog {n} nodig', '')).toEqual([]);
  });

  it('een zin met gaten leest met voorbeelden en de woorden van nu', () => {
    const words = { ...DEFAULT_WORDS, entry: 'wezen' };
    expect(renderSample('Zoek hierboven een {artikel} om te prikken.', words)).toBe(
      'Zoek hierboven een wezen om te prikken.',
    );
    expect(renderSample('Nog {n} nodig', words)).toBe('Nog 3 nodig');
  });

  it('een zelfstandig naamwoord toont zinnen waar het in staat, met het nieuwe woord', () => {
    const context = wordContext('entry', { entry: 'wezen' });
    expect(context.preview).toBeNull();
    expect(context.total).toBeGreaterThan(0);
    expect(context.elsewhere.length).toBeGreaterThan(0);
    for (const sentence of context.elsewhere) {
      expect(sentence).toContain('wezen');
      expect(sentence).not.toContain('{artikel}');
    }
  });

  it('een zin toont zichzelf', () => {
    const context = wordContext('boardEmptyFind', { boardEmptyFind: 'Zoek een {artikel}, of niet.' });
    expect(context.preview).toBe('Zoek een artikel, of niet.');
  });

  it('elk gat in de tabel wijst naar een woord dat bestaat', () => {
    for (const [hole, key] of Object.entries(HOLE_WORD)) expect(DEFAULT_WORDS[key], hole).toBeDefined();
  });
});

describe('Beheer op de telefoon: de index', () => {
  it('elk onderdeel heeft een regel eronder, uit lib/words.ts', () => {
    const page = read('app/(app)/admin/page.tsx');
    const keys = [...page.matchAll(/key: '([a-z]+)',\n\s+label:/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const key of keys) {
      expect(ADMIN_WHAT_KEY[key], key).toBeDefined();
      expect(DEFAULT_WORDS[ADMIN_WHAT_KEY[key]], key).toBeTruthy();
    }
    for (const key of ADMIN_FIRST) expect(ADMIN_WHAT_KEY[key]).toBeDefined();
  });

  it('de index staat alleen op een telefoon, en alleen zolang er niets gekozen is', () => {
    const css = read('app/beheer.css');
    expect(css).toMatch(/\.beheer-index,\s*\.beheer-terug\s*\{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*\.beheer-tabs\[data-index\] > \.beheer-index/);
    expect(read('components/admin/AdminTabs.tsx')).toContain("data-index={active === null ? 'ja' : undefined}");
  });

  it('beheer.css staat in de wortel-layout, na leeskamer.css', () => {
    const layout = read('app/layout.tsx');
    expect(layout.indexOf("import './beheer.css'")).toBeGreaterThan(layout.indexOf("import './leeskamer.css'"));
  });
});

describe('het wachtwoord-blad', () => {
  it('verzint een wachtwoord dat je kunt voorlezen', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = makePassword();
      expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(password).not.toMatch(/[01lio]/);
      expect(password.length).toBeGreaterThanOrEqual(8);
    }
    expect(makePassword(() => 0)).toBe('aaaa-aaaa-aaaa');
  });
});

describe('de woorden van golf i3', () => {
  it('passen in wat een Keeper mag terugschrijven, en roepen niet', () => {
    const block = read('lib/words.ts').split('// ── golf i3')[1] ?? '';
    const keys = [...block.matchAll(/key: '([a-zA-Z]+)'/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(30);
    for (const key of keys) {
      const word = DEFAULT_WORDS[key];
      expect(word, key).toBeTruthy();
      expect(word.length, key).toBeLessThanOrEqual(WORD_MAX);
      expect(word, key).not.toContain('!');
    }
  });
});

describe('na review 4', () => {
  it('L2: geen notitie of hint in Woorden toont nog een §-nummer', () => {
    for (const group of WORD_GROUPS) {
      if (group.note) expect(zonderParagraaf(group.note), group.title).not.toContain('§');
      for (const def of group.words) {
        if (def.hint) expect(zonderParagraaf(def.hint), def.key).not.toContain('§');
      }
    }
    expect(zonderParagraaf('§79: de kamer van één onderzoeker.')).toBe('De kamer van één onderzoeker.');
    expect(zonderParagraaf('Wie er is (§76), en waar.')).toBe('Wie er is, en waar.');
    expect(zonderParagraaf('Pas op. §85: heette "Iedereen", en dat las als een kop.')).toBe('Pas op.');
    expect(zonderParagraaf('Sinds §83 mag het vaker.')).toBe('Mag het vaker.');
    expect(zonderParagraaf('Geen nummer hier.')).toBe('Geen nummer hier.');
  });

  it('L5: een keuzelijst zonder keuzes wordt genoemd, met keuzes of zonder naam niet', () => {
    expect(
      choicelessFields([
        { key: 'klasse', label: 'Klasse', kind: 'select', options: [] },
        { key: 'lading', label: 'Lading', kind: 'multiselect', options: [' '] },
        { key: 'status', label: 'Status', kind: 'select', options: ['varend'] },
        { key: 'veld_4', label: '', kind: 'select' },
        { key: 'naam', label: 'Naam', kind: 'text' },
      ]),
    ).toEqual(['Klasse', 'Lading']);
  });

  it('M11: de korte namen horen bij soorten die bestaan', () => {
    const kinds = new Set(FIELD_KINDS.map((option) => option.kind as string));
    for (const kind of Object.keys(FIELD_KIND_SHORT)) expect(kinds.has(kind), kind).toBe(true);
    for (const label of Object.values(FIELD_KIND_SHORT)) expect(label.length).toBeLessThanOrEqual(22);
  });

  it('L6: elk onderdeel van Beheer heeft een eigen pictogram', () => {
    const page = read('app/(app)/admin/page.tsx');
    const icons = [...page.matchAll(/key: '[a-z]+',\n\s+label: [^\n]+\n(?:\s+\/\/[^\n]*\n)*\s+icon: '([a-z]+)'/g)].map((m) => m[1]);
    expect(icons.length).toBe(10);
    expect(new Set(icons).size).toBe(icons.length);
    // En niet het schildje van Beheer zelf, of het huisje van Start.
    expect(icons).not.toContain('shield');
    expect(icons).not.toContain('home');
  });

  it('M10: Beheer heeft geen + en op de telefoon na een keuze geen strook', () => {
    const css = read('app/beheer.css');
    expect(css).toMatch(/body:has\(\.beheer-tabs\) \.fab \{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.beheer-strip \{\s*display: none;/);
  });
});
