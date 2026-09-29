import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VoorafTekst } from '@/components/editor/VoorafTekst';
import { ShortChips, type ShortChipMap } from '@/components/ui/ShortChips';
import { NARROW_MEDIA, useHasRail, useIsWide, usePhoneKnown, WIDE_MEDIA } from '@/components/useIsPhone';

/**
 * §104, golf J (j4): de eerste verf van een artikel is al de vorm van het
 * scherm. De server kent de breedte niet; wat van de breedte afhangt, zegt
 * `null` tot de hydratatie en de stylesheet kiest.
 */

// Vitest zet de JSX van een .tsx om met de klassieke runtime (`React.createElement`).
(globalThis as { React?: typeof React }).React = React;

const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const chips: ShortChipMap = {
  zichtbaar: { entryId: 'e1', name: 'Veere', slug: 'veere', icon: 'pin', colour: '#1F4E79' },
  verborgen: null,
};

// Een HTML-attribuutnaam is hoofdletterongevoelig; React schrijft `contentEditable`.
function render(doc: unknown) {
  return renderToStaticMarkup(createElement(ShortChips, { map: chips, children: createElement(VoorafTekst, { doc }) })).replaceAll(
    'contentEditable=',
    'contenteditable=',
  );
}

const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const link = (handle: string) => ({ type: 'entryLink', attrs: { handle } });

describe('de breedte is op de server niet bekend', () => {
  it('useIsWide, useHasRail en usePhoneKnown zeggen null bij het renderen op de server', () => {
    const Probe = () => createElement('i', null, `${useIsWide()}|${useHasRail()}|${usePhoneKnown()}`);
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<i>null|null|null</i>');
  });

  it('één getal voor breed: 1280 in de hook, in de <source> en in de stylesheets', () => {
    expect(WIDE_MEDIA).toBe('(min-width: 1280px)');
    expect(NARROW_MEDIA).toBe('(max-width: 1279px)');
    const css = read('app/leeskamer.css');
    const block = css.slice(css.indexOf('/* ===== golf j4 */'));
    expect(block).toMatch(/@media \(min-width: 1280px\) \{\s*\/\*[^*]*\*\/\s*\.entry-layout-wide \{\s*grid-template-areas:/);
    expect(block).toMatch(/@media \(max-width: 1279px\) \{\s*\.entry-figure-beide \.entry-cover-whole/);
    expect(block).toMatch(/@media \(max-width: 1499px\) \{\s*\.entry-rail \{\s*display: none;/);
    expect(block).toMatch(/@media \(min-width: 1500px\) \{[\s\S]*\.entry-kop > \.entry-outline-row \{\s*display: none;/);
    // Het dossier kiest op 768 px, net als `PHONE`.
    expect(read('components/useIsPhone.ts')).toContain("const PHONE = '(max-width: 767px)'");
    expect(block).toMatch(/@media \(max-width: 767px\) \{\s*\.case-vroeg > \.case-tabs \{\s*display: none;/);
  });

  it('de gestapelde regels van de kast gelden alleen onder 1280 px', () => {
    const globals = read('app/globals.css');
    const at = globals.indexOf('.entry-aside-box-stacked {');
    expect(at).toBeGreaterThan(0);
    expect(globals.lastIndexOf('@media (max-width: 1279px) {', at)).toBeGreaterThan(globals.lastIndexOf('}\n\n', at - 200));
  });

  it('EntryView tekent één geraamte: geen kop buiten .entry-kop en geen `wide &&` meer', () => {
    const view = read('components/entry/EntryView.tsx');
    expect(view).toContain('<div className="entry-kop">');
    expect(view).not.toMatch(/\{!wide && /);
    expect(view).not.toMatch(/\{wide && /);
  });
});

describe('VoorafTekst: de tekst in de eerste verf, zoals ProseMirror hem tekent', () => {
  it('draagt de klassen van de editor, niet te bewerken', () => {
    const html = render({ type: 'doc', content: [p(text('Een plek.'))] });
    expect(html).toContain('<div class="tiptap ProseMirror prose vooraf-tekst" contenteditable="false" translate="no"><p>Een plek.</p></div>');
    // Dezelfde nesting als RichEditor: omhulsel › .editor-body › EditorContent › .ProseMirror.
    expect(html).toMatch(/^<div data-vooraf="tekst"><div class="editor-body"><div><div class="tiptap/);
  });

  it('een lege alinea is een regel hoog, zoals in de editor', () => {
    expect(render({ type: 'doc', content: [p()] })).toContain('<p><br class="ProseMirror-trailingBreak"/></p>');
  });

  it('koppen, lijsten, citaat en markeringen', () => {
    const html = render({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [text('Kop')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('een', [{ type: 'bold' }]))] }] },
        { type: 'blockquote', content: [p(text('zei hij', [{ type: 'italic' }, { type: 'link', attrs: { href: 'https://x.nl' } }]))] },
        { type: 'horizontalRule' },
      ],
    });
    expect(html).toContain('<h3>Kop</h3>');
    expect(html).toContain('<ul><li><p><strong>een</strong></p></li></ul>');
    expect(html).toContain('<blockquote><p><em><a href="https://x.nl" target="_blank" rel="noreferrer">zei hij</a></em></p></blockquote>');
    expect(html).toContain('<hr/>');
  });

  it('een link met een raar adres is geen link', () => {
    const html = render({ type: 'doc', content: [p(text('klik', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))] });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<p>klik</p>');
  });

  it('een chip die de pagina kent, is de chip van de node-view', () => {
    const html = render({ type: 'doc', content: [p(text('Naar '), link('zichtbaar'), text('.'))] });
    expect(html).toContain('class="entry-chip"');
    expect(html).toContain('href="/e/veere"');
    expect(html).toContain('style="--chip-colour:#1F4E79"');
    expect(html).toContain('>Veere</a>');
  });

  it('wat deze lezer niet mag zien, is niets, en de naad sluit zoals in Lezen', () => {
    const html = render({ type: 'doc', content: [p(text('Was er bij '), link('verborgen'), text(', en toen'))] });
    expect(html).toContain('<a class="entry-chip-none" contenteditable="false" data-entry-handle="verborgen" aria-hidden="true"></a>');
    expect(html).not.toContain('Veere');
    // "bij ⟦x⟧, en" leest "bij, en": de spatie vóór het gat valt weg.
    expect(html).toContain('Was er bij<span class="naad naad-wit"> </span>');
  });

  it('een alinea die met een gat begint, begint met een hoofdletter (naadHoofd)', () => {
    const html = render({ type: 'doc', content: [p(link('verborgen'), text(' en toen'))] });
    expect(html).toContain('<span class="naad-hoofd">e</span>');
  });

  it('zonder document: de lege plek van altijd', () => {
    expect(render(null)).toBe('<div class="editor-body" aria-busy="true"></div>');
  });
});
