import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSchema } from '@tiptap/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { tokenFor } from '@/lib/entries/shortTokens.mjs';
import { naadSneden, naadTekst, type NaadStuk } from '@/lib/wiki/naad';
import { snippetAround, snippetText } from '@/lib/wiki/snippet';
import { moreHref, readPagina, remaining, PAGE_SIZE } from '@/lib/wiki/pagina';

/**
 * §104, ronde 67·herstel (F3) — lezen.
 *
 *   1. **De naad** (#1). Wat een lezer niet mag zien is niets (§76, §89, §95,
 *      §97, §98) — en de woorden eromheen lezen netjes: geen spatie vóór een
 *      leesteken, geen dubbele spatie, geen spatie aan het begin van een
 *      alinea of vak, geen losse "bij , en". Eén regel (`lib/wiki/naad.ts`)
 *      voor de lopende tekst (de decoraties van `naadPlugin`), de korte vakken,
 *      `plainShort`, het fragment van *Genoemd in* en `closeGaps`. En er lekt
 *      niets: geen handvat, geen naam, geen lengte.
 *   2. **De lijst** (#14): `?pagina=` en `?per=` (`lib/wiki/pagina.ts`).
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-67-herstel-'));
process.env.DATA_DIR = dir;

const KEEPER = { id: 'k67h', isKeeper: true };
const SPELER = { id: 's67h', isKeeper: false };

const T = (tekst: string): NaadStuk => ({ tekst });
const H: NaadStuk = { verborgen: true };
const V: NaadStuk = { vast: true };
const BR: NaadStuk = { breuk: true };

/** What a reader reads: hidden is nothing, a solid piece is "NAAM". */
const lees = (...stukken: NaadStuk[]) => naadTekst(stukken, () => 'NAAM');

/** The four things that must never be in what a reader reads. */
function netjes(line: string) {
  expect(line).not.toMatch(/ [,.;:)?!…]/);
  expect(line).not.toMatch(/ {2}/);
  expect(line).not.toMatch(/^\s/);
  expect(line).not.toMatch(/\(\s*\)/);
  expect(line).not.toMatch(/,\s*,/);
}

describe('#1 de naad: de pure regel', () => {
  it('a hidden mention before a comma leaves no space before it — "bij , en" is "bij, en"', () => {
    const out = lees(T('Wie hier iets wil weten begint bij '), H, T(', en wie iets wil regelen bij '), V, T('.'));
    expect(out).toBe('Wie hier iets wil weten begint bij, en wie iets wil regelen bij NAAM.');
    netjes(out);
  });

  it('at the start of a paragraph, no space and no stray comma', () => {
    expect(lees(H, T(' heeft hier in maart iets opgetekend.'))).toBe('heeft hier in maart iets opgetekend.');
    expect(lees(H, T(', en toen ging hij.'))).toBe('en toen ging hij.');
    // After a hard break too: that is a line of its own.
    expect(lees(T('Eerste regel.'), BR, H, T(' tweede.'))).toBe('Eerste regel.\ntweede.');
  });

  it('between two spaces, one space — the first', () => {
    expect(lees(T('De brief ging van '), H, T(' naar de sluis.'))).toBe('De brief ging van naar de sluis.');
    const cuts = naadSneden([T('van '), H, T(' naar')]);
    expect(cuts).toEqual([[], [], [[0, 1]]]);
  });

  it('at the end, no space and no dangling comma', () => {
    expect(lees(T('Zie ook '), H)).toBe('Zie ook');
    expect(lees(T('Zie ook '), H, T('.'))).toBe('Zie ook.');
    expect(lees(T('met Jan, '), H)).toBe('met Jan');
  });

  it('brackets round nothing go with it; a bracket round something stays', () => {
    expect(lees(T('naar de sluis ('), H, T(') en terug.'))).toBe('naar de sluis en terug.');
    expect(lees(T('de sluis ('), H, T(' en '), V, T(') en terug.'))).toBe('de sluis (en NAAM) en terug.');
  });

  it('two separators become one — "a, ⟦x⟧, c" is "a, c"', () => {
    expect(lees(T('Jan, '), H, T(', Piet en Klaas.'))).toBe('Jan, Piet en Klaas.');
    expect(lees(T('Jan, '), H, T('.'))).toBe('Jan.');
  });

  it('several hidden mentions in a row are one gap', () => {
    expect(lees(H, T(' '), H, T(' gingen samen.'))).toBe('gingen samen.');
    expect(lees(T('Met '), H, T(' en '), H, T(' ging niemand.'))).toBe('Met en ging niemand.');
  });

  it('touches only the seam: two spaces typed elsewhere stay, a comma elsewhere stays', () => {
    expect(lees(T('a  b , c '), H, T(' d'))).toBe('a  b , c d');
  });

  it('with nothing hidden, nothing is cut', () => {
    const stukken = [T('van '), V, T(' , naar')];
    expect(naadSneden(stukken)).toEqual([[], [], []]);
  });

  it('never cuts into a visible name', () => {
    // A solid piece is a word: the comma after it and the space before it stay.
    expect(lees(T('bij '), V, T(', '), H, T(' en '), V)).toBe('bij NAAM, en NAAM');
  });
});

describe('#1 de naad in de lopende tekst: decoraties, geen andere tekst', () => {
  /* The rich editor's schema, with the node the node-view draws. */
  let schema: ReturnType<typeof getSchema>;
  let naadDecorations: typeof import('@/components/editor/EntryLink').naadDecorations;
  beforeAll(async () => {
    const { documentExtensions } = await import('@/lib/editor/extensions');
    schema = getSchema(documentExtensions({ history: false }));
    naadDecorations = (await import('@/components/editor/EntryLink')).naadDecorations;
  });

  const HIDDEN = 'Hgeheim0000000000000';
  const SHOWN = 'Hopen00000000000000';
  const para = (...content: object[]) => ({ type: 'paragraph', content });
  const text = (value: string) => ({ type: 'text', text: value });
  const link = (handle: string) => ({ type: 'entryLink', attrs: { handle } });

  /** The reading face: every text node minus its decorated ranges, a visible chip its name, a hidden one nothing. */
  function read(json: object): string[] {
    const doc = schema.nodeFromJSON(json);
    const set = naadDecorations(doc, (node) =>
      node.type.name === 'entryLink' ? ((node.attrs as { handle: string }).handle === SHOWN ? 'vast' : 'verborgen') : null,
    );
    const hidden = new Set<number>();
    for (const deco of set.find()) {
      // §104 (golf H, D28): beside the cuts, one `naad-hoofd` may mark the first
      // letter after a hidden name at the start of a paragraph — shown as a
      // capital in Lezen, never hidden (tests/unit/golf-h3-lezen.test.ts).
      const cls = (deco as unknown as { type: { attrs: { class?: string } } }).type.attrs.class;
      expect(['naad', 'naad-hoofd']).toContain(cls);
      if (cls !== 'naad') continue;
      for (let pos = deco.from; pos < deco.to; pos++) hidden.add(pos);
    }
    const lines: string[] = [];
    doc.forEach((block, offset) => {
      let line = '';
      block.forEach((child, childOffset) => {
        const at = offset + 1 + childOffset;
        if (child.isText) {
          for (let i = 0; i < (child.text ?? '').length; i++) if (!hidden.has(at + i)) line += child.text![i];
        } else if ((child.attrs as { handle?: string }).handle === SHOWN) line += 'De Broederschap';
      });
      lines.push(line);
    });
    return lines;
  }

  it('reads cleanly before a comma, at the start of a paragraph and between two spaces', () => {
    const lines = read({
      type: 'doc',
      content: [
        para(link(HIDDEN), text(' heeft hier in maart iets opgetekend.')),
        para(text('Wie hier iets wil weten begint bij '), link(HIDDEN), text(', en wie iets wil regelen bij '), link(SHOWN), text('.')),
        para(text('De brief ging van '), link(HIDDEN), text(' naar de sluis ('), link(HIDDEN), text(') en terug.')),
      ],
    });
    expect(lines).toEqual([
      'heeft hier in maart iets opgetekend.',
      'Wie hier iets wil weten begint bij, en wie iets wil regelen bij De Broederschap.',
      'De brief ging van naar de sluis en terug.',
    ]);
    for (const line of lines) {
      netjes(line);
      expect(line).not.toContain(HIDDEN);
      expect(line).not.toContain('Geheim');
    }
  });

  it('changes nothing in the document: a decoration is a class on a range, never text', () => {
    const json = { type: 'doc', content: [para(text('bij '), link(HIDDEN), text(', en'))] };
    const doc = schema.nodeFromJSON(json);
    naadDecorations(doc, () => 'verborgen');
    expect(doc.toJSON()).toEqual(json);
  });

  it('a paragraph without a hidden reference gets no decoration at all', () => {
    const doc = schema.nodeFromJSON({ type: 'doc', content: [para(text('a  , b '), link(SHOWN), text(' .'))] });
    expect(naadDecorations(doc, () => 'vast').find()).toHaveLength(0);
  });
});

describe('#1 de naad in een fragment onder Genoemd in', () => {
  const OWN = 'Hown00000000000000000';
  const HIDDEN = 'Hhid00000000000000000';
  const options = {
    isOwn: (handle: string) => handle === OWN,
    ownName: 'Vlissingen',
    nameOf: () => null,
  };

  it('closes the seam before a comma, at the start and in brackets, and leaks nothing', () => {
    const text = `${tokenFor(HIDDEN)} zag ${tokenFor(OWN)} (${tokenFor(HIDDEN)}), en ${tokenFor(HIDDEN)}, verder niemand.`;
    const out = snippetText(snippetAround(text, options));
    expect(out).toBe('zag **Vlissingen**, en, verder niemand.');
    netjes(out.replace(/\*\*/g, ''));
    expect(out).not.toContain(HIDDEN);
    expect(out).not.toContain('⟦');
  });
});

describe('#1 de naad op de server: plainShort en closeGaps', () => {
  type Deps = { sqlite: typeof import('@/lib/db').sqlite; refs: typeof import('@/lib/entries/shortRefs') };
  let deps: Deps;
  let open: string;
  let secret: string;
  const para = (...content: object[]) => ({ type: 'paragraph', content });
  const text = (value: string) => ({ type: 'text', text: value });
  const link = (handle: string) => ({ type: 'entryLink', attrs: { handle } });
  const docOf = (...blocks: object[]) => ({ type: 'doc', content: blocks });

  beforeAll(async () => {
    const dbModule = await import('@/lib/db');
    deps = { sqlite: dbModule.sqlite, refs: await import('@/lib/entries/shortRefs') };
    const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);
    for (const [id, name, keeper] of [
      ['k67h', 'Keeper', 1],
      ['s67h', 'Speler', 0],
    ] as const) {
      run(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`, id, name, name.toLowerCase(), keeper);
    }
    for (const [id, name, visibility] of [
      ['open67', 'De Broederschap', 'all'],
      ['geheim67', 'Verborgen Sluiswachter', 'keeper'],
    ] as const) {
      run(
        `INSERT INTO entries (id, type_id, name, slug, short_description, fields, tags, visibility, created_by, view_mode)
         VALUES (?, 'character', ?, ?, '', '{}', '[]', ?, 'k67h', 'all')`,
        id,
        name,
        id,
        visibility,
      );
    }
    open = deps.refs.mintHandle('open67', KEEPER)!;
    secret = deps.refs.mintHandle('geheim67', KEEPER)!;
  });

  it('plainShort: the speler reads the sentence without the name and without the seam; the Keeper reads it whole', () => {
    const value = `${tokenFor(secret)} zag het. Gezien bij ${tokenFor(secret)}, in de mist, met ${tokenFor(open)}.`;
    const speler = deps.refs.plainShort(SPELER, value);
    expect(speler).toBe('zag het. Gezien bij, in de mist, met De Broederschap.');
    netjes(speler);
    expect(speler).not.toContain('Verborgen');
    expect(speler).not.toContain(secret);
    expect(deps.refs.plainShort(KEEPER, value)).toBe(
      'Verborgen Sluiswachter zag het. Gezien bij Verborgen Sluiswachter, in de mist, met De Broederschap.',
    );
  });

  it('closeGaps: a link that really falls away takes the space before a comma with it', () => {
    const out = deps.refs.cleanDocRefs(docOf(para(text('begint bij '), link(secret), text(', en wie'))), { prev: null, actor: SPELER }) as {
      content: { content: unknown[] }[];
    };
    expect(out.content[0].content).toEqual([text('begint bij, en wie')]);
  });

  it('closeGaps: the round-63 seams still hold — one space between, none at the edges', () => {
    const between = deps.refs.cleanDocRefs(docOf(para(text('zag '), link(secret), text(' bij de sluis'))), { prev: null, actor: SPELER }) as {
      content: { content: unknown[] }[];
    };
    expect(between.content[0].content).toEqual([text('zag bij de sluis')]);
  });
});

describe('#14 de lijst: hoe ver je leest staat in het adres', () => {
  it('reads ?pagina= and ?per=, within bounds', () => {
    expect(readPagina({})).toEqual({ per: PAGE_SIZE, pagina: 1, shown: PAGE_SIZE });
    expect(readPagina({ pagina: '2' })).toEqual({ per: 120, pagina: 2, shown: 240 });
    expect(readPagina({ per: '10', pagina: '3' }).shown).toBe(30);
    expect(readPagina({ per: '1' }).per).toBe(10);
    expect(readPagina({ per: '5000' }).per).toBe(120);
    expect(readPagina({ pagina: '-4' }).pagina).toBe(1);
    expect(readPagina({ pagina: 'drie' }).pagina).toBe(1);
    expect(readPagina({ pagina: '999999' }).pagina).toBe(50);
  });

  it('Meer keeps the sort and the filters and goes one step further', () => {
    const now = readPagina({ sort: 'name', tag: 'kust', pagina: '1' });
    expect(moreHref('/wiki/alles', { sort: 'name', tag: 'kust', pagina: '1' }, now)).toBe('/wiki/alles?sort=name&tag=kust&pagina=2');
    expect(remaining(209, now)).toBe(89);
    expect(remaining(100, now)).toBe(0);
  });
});
