import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateAsks } from '@/lib/canvas/authorGate';
import { typingScroll, TYPING_ROOM } from '@/lib/entries/typingView';
import { typeFold, TYPE_ROWS_DESK, TYPE_ROWS_PHONE } from '@/lib/entries/typeFold';
import { bestScore, nameScore, orderSections, othersFirst, palettePlan, TAG_CEILING } from '@/lib/search/rang';
import { WORD_DEFS } from '@/lib/words';

/**
 * Golf J, j2: schrijven en zoeken, na de meting na golf I.
 *
 *  - stuk 2a: *Sectie toevoegen* wordt niet meer opgegeten door de schrijfvraag;
 *  - stuk 5: na *Aanmaken* staat de tekst boven de tabbalk;
 *  - stuk 6: de beste naam staat bovenaan, welk soort ding het ook is;
 *  - stuk 7: de soorten in het maakblad vouwen na hele regels.
 */

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('stuk 2a: de sectieknop vraagt eerst en maakt daarna', () => {
  // The surface's gate is `useCanvasAuthorGate(true)`: `gateAsks(true, …)`.
  const el = (offMark: boolean) => ({
    tagName: 'BUTTON',
    closest: (selector: string) => (offMark && selector === '[data-author-gate="off"]' ? {} : null),
  });

  it('a press on a control marked off does not raise the question on the way down', () => {
    expect(gateAsks(true, el(true) as unknown as EventTarget)).toBe(false);
  });

  it('anything else on the writing surface still asks', () => {
    expect(gateAsks(true, el(false) as unknown as EventTarget)).toBe(true);
  });

  it('the sectie surface wears the gate that reads the mark, and both makers ask first', () => {
    const source = read('components/entry/SectionsEditor.tsx');
    expect(source).toContain('useCanvasAuthorGate(true)');
    expect(source).not.toMatch(/const gate = useAuthorGate\(\)/);
    expect(source).toMatch(/onClick=\{\(\) => askThen\(\(\) => void add\(\)\)\}/);
    expect(source).toMatch(/onClick=\{\(\) => askThen\(\(\) => void remove\(section\.id\)\)\}/);
  });
});

describe('stuk 5: wat je typt, staat in beeld', () => {
  it('leaves a page alone when the text is already comfortably in view (a desk)', () => {
    expect(typingScroll({ blockTop: 300, caretTop: 360, viewHeight: 900, coverBottom: 0 })).toBe(0);
  });

  it('brings a block under the tab bar up to a fifth of what is visible (the phone of the meting)', () => {
    // The meting: the text box at y = 815, the tab bar from 785 on an 844 screen.
    const delta = typingScroll({ blockTop: 760, caretTop: 815, viewHeight: 844, coverBottom: 59 });
    expect(delta).toBeGreaterThan(0);
    const landed = 815 - delta;
    expect(landed + TYPING_ROOM).toBeLessThanOrEqual(844 - 59);
    expect(760 - delta).toBeCloseTo((844 - 59) * 0.2, 0);
  });

  it('also scrolls when the caret is fine but the block has gone above the top', () => {
    expect(typingScroll({ blockTop: -40, caretTop: 20, viewHeight: 844, coverBottom: 59 })).toBeLessThan(0);
  });

  it('the + steps aside while a caret is in a writing box on a phone', () => {
    const css = read('app/leeskamer.css');
    expect(css).toContain("body:has(.main :is([contenteditable='true'], textarea");
    expect(css).toContain("input[type='search']):focus) .fab {");
  });
});

describe('stuk 6: een goede naam staat bovenaan', () => {
  it('scores the name and the tags with the searcher’s own measure', () => {
    expect(nameScore('Walcheren na de Drift', 'Walcheren')).toBeGreaterThan(nameScore('Een reis over Walcheren', 'Walcheren'));
    // A tag says what a thing is about, not what it is called: below any name that contains the word.
    expect(nameScore('Zuster Clasina', 'duits', ['duits'])).toBe(TAG_CEILING);
    expect(nameScore('Domburg', 'walcheren', ['walcheren'])).toBeLessThan(nameScore('Walcheren na de Drift', 'walcheren'));
    expect(nameScore('Zuster Clasina', 'februari')).toBe(0);
  });

  it('puts the other things first when their best name is at least as good', () => {
    expect(othersFirst(0, 788)).toBe(true); // "afstamt": only text hits among the artikelen
    expect(othersFirst(792, 792)).toBe(true); // "Holle": a dossier and an artikel of one name
    expect(othersFirst(1000, 888)).toBe(false); // an artikel called exactly that
    expect(othersFirst(0, 0)).toBe(false);
  });

  it('the palet keeps the first other thing in view when the artikelen lead', () => {
    const lead = palettePlan({ entryCount: 20, otherCount: 3, bestEntryName: 1000, bestOther: 888 });
    expect(lead).toEqual({ first: 'entries', entries: 5, others: 3 });
    const follow = palettePlan({ entryCount: 20, otherCount: 1, bestEntryName: 0, bestOther: 792 });
    expect(follow).toEqual({ first: 'others', entries: 8, others: 1 });
    const alone = palettePlan({ entryCount: 20, otherCount: 0, bestEntryName: 900, bestOther: 0 });
    expect(alone).toEqual({ first: 'entries', entries: 8, others: 0 });
  });

  it('/search orders its sections by their best name, stably, others first on a tie', () => {
    const order = orderSections([
      { key: 'Personen', best: 800 },
      { key: 'Locaties', best: 1000 },
      { key: 'Clues', best: 800 },
      { key: 'others', best: 888, other: true },
    ]).map((section) => section.key);
    expect(order).toEqual(['Locaties', 'others', 'Personen', 'Clues']);
    expect(orderSections([{ key: 'a', best: 800 }, { key: 'others', best: 800, other: true }]).map((s) => s.key)).toEqual([
      'others',
      'a',
    ]);
  });

  it('bestScore is 0 for nothing', () => {
    expect(bestScore([], () => 5)).toBe(0);
    expect(bestScore([1, 7, 3], (n) => n)).toBe(7);
  });
});

describe('stuk 7: de soorten vouwen na hele regels', () => {
  /** Seventeen chips of 34 px on rows 40 px apart: widths decide how many per row. */
  const rowsOf = (perRow: number[], chosen = -1) => {
    const chips: { top: number; bottom: number; chosen?: boolean }[] = [];
    perRow.forEach((count, row) => {
      for (let i = 0; i < count; i++) chips.push({ top: 3 + row * 40, bottom: 37 + row * 40, chosen: chips.length === chosen });
    });
    return chips;
  };

  it('a desk shows two whole rows and counts the rest', () => {
    const fold = typeFold(rowsOf([4, 4, 4, 4, 1]), TYPE_ROWS_DESK)!;
    expect(fold).toEqual({ height: 77, hidden: 9, chosenHidden: false });
  });

  it('a phone shows three, so the seventh soort (Huisraad) is in view', () => {
    const chips = rowsOf([3, 3, 3, 3, 3, 2]);
    const fold = typeFold(chips, TYPE_ROWS_PHONE)!;
    expect(fold.hidden).toBe(17 - 9);
    // The seventh chip (index 6) is on the third row, above the fold.
    expect(chips[6].top).toBeLessThan(fold.height);
  });

  it('nothing folds when everything fits', () => {
    expect(typeFold(rowsOf([5, 3]), TYPE_ROWS_DESK)).toEqual({ height: 77, hidden: 0, chosenHidden: false });
  });

  it('says so when the chosen soort would be under the fold (§101: then it opens)', () => {
    expect(typeFold(rowsOf([4, 4, 4], 10), TYPE_ROWS_DESK)!.chosenHidden).toBe(true);
    expect(typeFold(rowsOf([4, 4, 4], 2), TYPE_ROWS_DESK)!.chosenHidden).toBe(false);
  });

  it('the count is a word with a hole', () => {
    const def = WORD_DEFS.find((word) => word.key === 'newEntryTypeRest');
    expect(def?.fallback).toBe('+{n}');
  });
});

describe('raden 7, stuk 11, stuk 13: de tags en de naad', () => {
  it('the folded infobox always ends in its tags, as links to the list', () => {
    const source = read('components/entry/FieldsEditor.tsx');
    expect(source).toContain('infobox-peek-tags');
    expect(source).not.toContain("{!rows.length && tags.length > 0 && (");
    expect(read('components/entry/EntryView.tsx')).toMatch(/<FieldsPeek[^>]*tagHref=\{tagHref\}/);
  });

  it('a tag’s rim on a phone is at least a thumb wide', () => {
    expect(read('app/leeskamer.css')).toMatch(/width: max\(calc\(100% \+ 0\.4rem\), var\(--tap\)\)/);
  });

  it('in Bewerken the white of a seam closes, a stop does not', () => {
    const css = read('app/leeskamer.css');
    expect(css).toMatch(/\.ProseMirror\[contenteditable='true'\] \.naad-wit \{\s*font-size: 0;/);
    expect(css).not.toMatch(/\.ProseMirror\[contenteditable='true'\] \.naad \{/);
  });
});

describe('stuk 13: de decoraties zeggen welk stuk alleen wit is', () => {
  it('marks a white-only cut `naad-wit` and a cut with a stop only `naad`', async () => {
    const { getSchema } = await import('@tiptap/core');
    const { documentExtensions } = await import('@/lib/editor/extensions');
    const { naadDecorations } = await import('@/components/editor/EntryLink');
    const schema = getSchema(documentExtensions({ history: false }));
    const link = { type: 'entryLink', attrs: { handle: 'Hgeheim0000000000000' } };
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Was er bij ' }, link, { type: 'text', text: ', en is daar.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'a, ' }, link, { type: 'text', text: ', c' }] },
      ],
    });
    const found = naadDecorations(doc, () => 'verborgen')
      .find()
      .map((deco) => ({
        text: doc.textBetween(deco.from, deco.to),
        cls: (deco as unknown as { type: { attrs: { class: string } } }).type.attrs.class,
      }));
    expect(found).toContainEqual({ text: ' ', cls: 'naad naad-wit' });
    expect(found.some((deco) => deco.cls === 'naad' && /[,]/.test(deco.text))).toBe(true);
    for (const deco of found) if (deco.cls === 'naad naad-wit') expect(deco.text.trim()).toBe('');
  });
});
