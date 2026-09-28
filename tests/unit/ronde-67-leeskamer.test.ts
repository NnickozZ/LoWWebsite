import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { tokenFor } from '@/lib/entries/shortTokens.mjs';
import { snippetAround, snippetText, SNIPPET_WIDTH, ELLIPSIS } from '@/lib/wiki/snippet';
import { anchorBase, headingHref, headingIds } from '@/lib/wiki/anchors';
import { twinFieldOf, type PageBlock } from '@/lib/pageBlocks';
import { paletteActions, filterActions, type PaletteRole } from '@/lib/palette/actions';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX } from '@/lib/words';
import { RESERVED_WIKI_SLUGS } from '@/lib/slug';

/**
 * §104, ronde 67 — *De leeskamer*.
 *
 *   1. de zin onder *Genoemd in* (`snippetAround`), puur: de eigen naam vet,
 *      een woordgrens met `…`, en een handvat dat de lezer niet mag volgen is
 *      **niets** — geen naam, geen handvat, geen gat;
 *   2. hetzelfde tegen een echte SQLite, per lezer, voor elke soort bron
 *      (`mentionSentences`), met een onzichtbare vermelding midden in het
 *      fragment;
 *   3. `randomEntry`: nooit iets dat de lezer niet mag zien, en nooit van de
 *      andere kant (§46);
 *   4. *Onlangs bijgewerkt*: per kant, het karakter uit de versie, en voor een
 *      speler geen Keeper-tijdperk — dezelfde versie als `listRevisions`;
 *   5. de kop-ankers, L9's tweeling, het palet en de woorden.
 */

const dir = mkdtempSync(join(tmpdir(), 'zcf-ronde-67-'));
process.env.DATA_DIR = dir;

/* ------------------------------------------------------------ 1. pure */

const OWN = 'eigenAAAAA1';
const HIDDEN = 'geheimBBBB2';
const SEEN = 'zichtbaarC3';
const names: Record<string, string> = { [SEEN]: 'Anneke Visser' };
const opts = {
  isOwn: (handle: string) => handle === OWN,
  ownName: 'Jacob den Hollander',
  nameOf: (handle: string) => names[handle] ?? null,
};

describe('§104 L3: de zin, puur', () => {
  it('zet de eigen naam vet en de andere naam zoals de lezer hem mag lezen', () => {
    const text = `${tokenFor(OWN)} houdt het licht bij, samen met ${tokenFor(SEEN)}.`;
    const snippet = snippetAround(text, opts)!;
    expect(snippetText(snippet)).toBe('**Jacob den Hollander** houdt het licht bij, samen met Anneke Visser.');
    expect(snippet.cutStart).toBe(false);
    expect(snippet.cutEnd).toBe(false);
  });

  it('laat een verborgen vermelding weg: geen naam, geen handvat, geen dubbele spatie', () => {
    const text = `De brief van ${tokenFor(HIDDEN)} aan ${tokenFor(OWN)} kwam nooit aan.`;
    const out = snippetText(snippetAround(text, opts));
    expect(out).toBe('De brief van aan **Jacob den Hollander** kwam nooit aan.');
    expect(out).not.toContain(HIDDEN);
    expect(out).not.toContain('⟦');
    expect(out).not.toContain('  ');
  });

  it('knipt op een woordgrens, met … aan de kant waar de tekst doorliep', () => {
    const lang = 'woord '.repeat(60);
    const text = `${lang}en hier ${tokenFor(OWN)} staat ${lang}`;
    const snippet = snippetAround(text, opts)!;
    const out = snippetText(snippet);
    expect(out.startsWith(ELLIPSIS)).toBe(true);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
    // Geen half woord aan de randen.
    expect(out.slice(1, -1).trim().split(' ').every((w) => ['woord', 'en', 'hier', '**Jacob', 'den', 'Hollander**', 'staat'].includes(w))).toBe(true);
    // Ongeveer de maat, en nooit veel meer.
    expect(out.replace(/\*\*/g, '').length).toBeLessThanOrEqual(SNIPPET_WIDTH + 2);
    expect(out.replace(/\*\*/g, '').length).toBeGreaterThan(SNIPPET_WIDTH * 0.6);
  });

  it('begint liever aan het begin van de zin, en houdt op aan het eind ervan', () => {
    const text = `Een zin ervoor die niet ter zake doet. Toen kwam ${tokenFor(OWN)} binnen. En toen nog iets heel anders, en nog veel meer woorden die allemaal niet in het venster passen omdat het te lang is.`;
    const out = snippetText(snippetAround(text, opts));
    expect(out).toBe('Toen kwam **Jacob den Hollander** binnen.');
    // Een korte tekst mag heel blijven: dan is er niets te knippen.
    expect(snippetText(snippetAround(`Toen kwam ${tokenFor(OWN)} binnen. Daarna niets.`, opts))).toBe(
      'Toen kwam **Jacob den Hollander** binnen. Daarna niets.',
    );
  });

  it('meet het venster ná het weglaten, zodat de lengte van een verborgen naam niets zegt', () => {
    const a = snippetAround(`${'x '.repeat(30)}${tokenFor(HIDDEN)} ${tokenFor(OWN)} ${'y '.repeat(30)}`, opts);
    const b = snippetAround(`${'x '.repeat(30)}${tokenFor(OWN)} ${'y '.repeat(30)}`, opts);
    expect(snippetText(a)).toBe(snippetText(b));
  });

  it('zegt niets als de tekst dit artikel (niet meer) noemt', () => {
    expect(snippetAround(`Alleen ${tokenFor(SEEN)}.`, opts)).toBeNull();
    expect(snippetAround('', opts)).toBeNull();
  });

  it('leest een alinea niet over de grens heen', () => {
    const text = `Vorige alinea zonder punt\n${tokenFor(OWN)} opent de nieuwe.`;
    expect(snippetText(snippetAround(text, opts))).toBe('**Jacob den Hollander** opent de nieuwe.');
  });
});

describe('§104 L7: kop-ankers', () => {
  it('een id uit de koptekst, uniek in de volgorde van de pagina', () => {
    expect(headingIds(['De haven', 'De Haven', 'Ééntje  met  accent', ''])).toEqual(['de-haven', 'de-haven-2', 'eentje-met-accent', 'kop']);
  });
  it('nooit een id dat de pagina al gebruikt', () => {
    expect(headingIds(['Block body'], (id) => id === 'block-body')).toEqual(['block-body-2']);
  });
  it('stabiel: dezelfde koppen geven dezelfde ids', () => {
    const koppen = ['Wat we weten', 'Wat we niet weten', 'Wat we weten'];
    expect(headingIds(koppen)).toEqual(headingIds([...koppen]));
    expect(anchorBase('  Wat we weten ')).toBe('wat-we-weten');
  });
  it('kopieert het adres van het artikel met de kop erachter', () => {
    expect(headingHref('https://archief.nl', 'veere', 'de-haven')).toBe('https://archief.nl/e/veere#de-haven');
  });
});

describe('§104 L9: één woord, één antwoord', () => {
  const fields = [
    { key: 'leden', label: 'Leden', kind: 'entry_links' },
    { key: 'status', label: 'Status', kind: 'select' },
  ];
  const block = (title?: string): PageBlock => ({ id: 'leden', kind: 'derived', title, viaField: 'familie' });
  it('een afgeleid blok met de kop van een koppelingsveld neemt dat veld erbij', () => {
    expect(twinFieldOf(block('Leden'), fields)?.key).toBe('leden');
    expect(twinFieldOf(block('  leden '), fields)?.key).toBe('leden');
  });
  it('een andere kop, of een veld dat geen koppeling is: los', () => {
    expect(twinFieldOf(block('Wijst naar deze familie'), fields)).toBeNull();
    expect(twinFieldOf(block('Status'), fields)).toBeNull();
    expect(twinFieldOf(block(undefined), fields)).toBeNull();
    expect(twinFieldOf({ id: 'x', kind: 'links', title: 'Leden' }, fields)).toBeNull();
  });
});

describe('§104 L2: het palet en het adres', () => {
  const role: PaletteRole = {
    words: DEFAULT_WORDS,
    keeperHere: false,
    mayType: true,
    purse: null,
    myPage: null,
    characters: [],
    activeId: null,
    side: 'player',
  };
  it('Verras me staat er voor iedereen die leest, en gaat naar /wiki/willekeurig', () => {
    for (const r of [role, { ...role, keeperHere: true, side: 'keeper' as const }, { ...role, mayType: false }]) {
      const surprise = paletteActions(r).find((action) => action.key === 'surprise');
      expect(surprise?.label).toBe('Verras me');
      expect(surprise?.run).toEqual({ kind: 'href', href: '/wiki/willekeurig' });
    }
    expect(filterActions(paletteActions(role), 'verr').map((a) => a.key)).toEqual(['surprise']);
  });
  it('willekeurig is een adres dat geen soort mag pakken', () => {
    expect(RESERVED_WIKI_SLUGS).toContain('willekeurig');
  });
});

describe('§104 woorden', () => {
  it('staan in hun eigen groep, passen in WORD_MAX en zeggen wat de opdracht zegt', () => {
    const group = WORD_GROUPS.find((g) => g.title === 'De leeskamer');
    expect(group).toBeDefined();
    for (const word of group!.words) expect(word.fallback.length).toBeLessThanOrEqual(WORD_MAX);
    expect(DEFAULT_WORDS.headingLinkCopied).toBe('Link gekopieerd');
    expect(DEFAULT_WORDS.surpriseMe).toBe('Verras me');
    for (const word of group!.words) expect(word.fallback).not.toMatch(/!/);
  });
});

/* ------------------------------------------------------ 2–4. per lezer */

const KEEPER = { id: 'k67', isKeeper: true, side: 'player' as const };
const KEEPER_OWN_SIDE = { id: 'k67', isKeeper: true, side: 'keeper' as const };
const SPELER = { id: 's67', isKeeper: false };

type Deps = {
  sqlite: typeof import('@/lib/db').sqlite;
  genoemd: typeof import('@/lib/wiki/genoemd');
  leeskamer: typeof import('@/lib/wiki/leeskamer');
  mentions: typeof import('@/lib/entries/mentions');
  entries: typeof import('@/lib/entries/service');
};
let deps: Deps;
const run = (sql: string, ...args: unknown[]) => deps.sqlite.prepare(sql).run(...args);

function entry(id: string, name: string, extra: { visibility?: string; short?: string; bodyText?: string; fields?: object } = {}) {
  run(
    `INSERT INTO entries (id, type_id, name, slug, short_description, body, body_text, fields, tags, visibility, created_by, view_mode, edit_mode, is_locked)
     VALUES (?, 'character', ?, ?, ?, '{"type":"doc","content":[{"type":"paragraph"}]}', ?, ?, '[]', ?, 'k67', 'all', 'all', 0)`,
    id,
    name,
    id,
    extra.short ?? '',
    extra.bodyText ?? '',
    JSON.stringify(extra.fields ?? {}),
    extra.visibility ?? 'all',
  );
}
const handle = (h: string, entryId: string) => run(`INSERT INTO mention_handles (handle, entry_id) VALUES (?, ?)`, h, entryId);
const revision = (id: string, entryId: string, at: number, by: string, visibility = 'all') =>
  run(
    `INSERT INTO entry_revisions (id, entry_id, snapshot, edited_by, created_at) VALUES (?, ?, ?, ?, ?)`,
    id,
    entryId,
    JSON.stringify({ name: entryId, visibility }),
    by,
    at,
  );

beforeAll(async () => {
  const dbModule = await import('@/lib/db');
  deps = {
    sqlite: dbModule.sqlite,
    genoemd: await import('@/lib/wiki/genoemd'),
    leeskamer: await import('@/lib/wiki/leeskamer'),
    mentions: await import('@/lib/entries/mentions'),
    entries: await import('@/lib/entries/service'),
  };
  for (const [id, name, keeper] of [
    ['k67', 'Keeper', 1],
    ['s67', 'Speler', 0],
  ] as const) {
    run(`INSERT INTO users (id, username, username_lower, password_hash, is_keeper) VALUES (?, ?, ?, 'x', ?)`, id, name, name.toLowerCase(), keeper);
  }

  entry('jacob', 'Jacob den Hollander');
  entry('anneke', 'Anneke Visser');
  entry('jongen', 'De Verdronken Jongen', { visibility: 'keeper' });
  handle('hJacob01', 'jacob');
  handle('hJacob02', 'jacob');
  handle('hAnneke1', 'anneke');
  handle('hJongen1', 'jongen');

  // Een artikel dat Jacob in zijn lopende tekst noemt, naast de geheime jongen.
  entry('vuurtoren', 'Westkapelle', {
    bodyText: `${tokenFor('hJacob01')} begroef ${tokenFor('hJongen1')} twee keer, zegt ${tokenFor('hAnneke1')}.`,
  });
  run(`INSERT INTO entry_links (from_entry_id, to_entry_id, kind, label) VALUES ('vuurtoren', 'jacob', 'mention', ''), ('vuurtoren', 'jongen', 'mention', '')`);

  // En een korte beschrijving die hem noemt (§98: telt onder Genoemd in).
  entry('brief', 'De brief', { short: `Geschreven door ${tokenFor('hJacob02')} aan ${tokenFor('hJongen1')}.` });

  // Een sectie die de lezer mag zien, en een van de Keeper met hetzelfde soort zin.
  const link = (h: string) => ({ type: 'entryLink', attrs: { handle: h } });
  const t = (value: string) => ({ type: 'text', text: value });
  const doc = (...content: object[]) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content }] });
  run(
    `INSERT INTO sections (id, owner_kind, owner_id, title, body, body_text, visibility, sort_order) VALUES
     ('sec-open', 'entry', 'anneke', 'Metingen', ?, ?, 'all', 0),
     ('sec-dicht', 'entry', 'anneke', 'Geheim', ?, ?, 'keeper', 1)`,
    doc(t('Haar metingen noemen '), link('hJacob01'), t(' als getuige.')),
    `Haar metingen noemen ${tokenFor('hJacob01')} als getuige.`,
    doc(t('Alleen de Keeper weet dat '), link('hJacob01'), t(' '), link('hJongen1'), t(' kende.')),
    `Alleen de Keeper weet dat ${tokenFor('hJacob01')} ${tokenFor('hJongen1')} kende.`,
  );

  const { recomputeFieldMentions, recomputeSectionMentions } = deps.mentions;
  recomputeFieldMentions('brief');
  recomputeSectionMentions('anneke');

  // Versies: de jongen alleen van de Keeper; Jacob eerst door de speler, later
  // in een Keeper-tijdperk door de Keeper.
  revision('r1', 'anneke', 1000, 's67');
  revision('r2', 'jacob', 2000, 's67');
  revision('r3', 'jacob', 3000, 'k67', 'keeper');
  revision('r4', 'jongen', 4000, 'k67', 'keeper');
  revision('r5', 'vuurtoren', 1500, 'k67');
  revision('r6', 'brief', 500, 's67');
});

describe('§104 L3: Genoemd in, per lezer', () => {
  const sentencesFor = (viewer: typeof KEEPER | typeof SPELER) => {
    const backlinks = deps.entries.getBacklinks('jacob', viewer).map((row) => row.id);
    const mentions = deps.mentions.listMentions('jacob', viewer);
    return { backlinks, mentions, sentences: deps.genoemd.mentionSentences(viewer, { id: 'jacob', name: 'Jacob den Hollander' }, backlinks, mentions) };
  };

  it('een speler: de zin met de naam vet, en van de geheime jongen geen naam en geen handvat', () => {
    const { backlinks, mentions, sentences } = sentencesFor(SPELER);
    expect(backlinks).toEqual(['vuurtoren']);
    const body = snippetText(sentences.backlinks.get('vuurtoren')!);
    expect(body).toBe('**Jacob den Hollander** begroef twee keer, zegt Anneke Visser.');

    const all = [
      body,
      ...[...sentences.mentions.values()].map((s) => snippetText(s)),
    ].join('\n');
    for (const leak of ['Verdronken', 'Jongen', 'hJongen1', '⟦', '⟧']) expect(all).not.toContain(leak);

    // De korte beschrijving van De brief, en de open sectie van Anneke — de dichte niet.
    const keys = mentions.map((m) => `${m.kind}:${m.name}:${m.detail}`);
    expect(keys).toContain('field:De brief:');
    expect(keys).toContain('section:Anneke Visser:Metingen');
    expect(keys.some((k) => k.includes('Geheim'))).toBe(false);
    const brief = mentions.find((m) => m.name === 'De brief')!;
    expect(snippetText(sentences.mentions.get(deps.mentions.mentionKey(brief))!)).toBe('Geschreven door **Jacob den Hollander** aan.');
    const sectie = mentions.find((m) => m.detail === 'Metingen')!;
    expect(snippetText(sentences.mentions.get(deps.mentions.mentionKey(sectie))!)).toBe(
      'Haar metingen noemen **Jacob den Hollander** als getuige.',
    );
  });

  it('de Keeper: dezelfde zinnen, met de naam die hij wél mag zien', () => {
    const { sentences, mentions } = sentencesFor(KEEPER);
    expect(snippetText(sentences.backlinks.get('vuurtoren')!)).toContain('begroef De Verdronken Jongen twee keer');
    const geheim = mentions.find((m) => m.detail === 'Geheim')!;
    expect(snippetText(sentences.mentions.get(deps.mentions.mentionKey(geheim))!)).toContain('De Verdronken Jongen');
  });
});

describe('§104 L2: willekeurig', () => {
  it('een speler komt nooit op iets van de Keeper uit', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(deps.leeskamer.randomEntry(SPELER)!.id);
    expect(seen.has('jongen')).toBe(false);
    expect(seen.size).toBeGreaterThan(2);
  });
  it('de Keeper op zijn eigen kant: alleen zijn eigen dingen; op de kant van de spelers: alleen die van hen', () => {
    for (let i = 0; i < 60; i++) expect(deps.leeskamer.randomEntry(KEEPER_OWN_SIDE)!.id).toBe('jongen');
    for (let i = 0; i < 120; i++) expect(deps.leeskamer.randomEntry(KEEPER)!.id).not.toBe('jongen');
  });
  it('Nog één geeft een ander, tenzij er maar één is', () => {
    for (let i = 0; i < 60; i++) expect(deps.leeskamer.randomEntry(SPELER, 'jacob')!.id).not.toBe('jacob');
    expect(deps.leeskamer.randomEntry(KEEPER_OWN_SIDE, 'jongen')!.id).toBe('jongen');
    expect(deps.leeskamer.randomEntry(null)).toBeNull();
  });
  it('de kaart zegt een verborgen naam in de korte beschrijving niet', () => {
    const brief = deps.entries.getEntrySummaryById('brief')!;
    const card = deps.leeskamer.archiveCard(SPELER, brief)!;
    expect(card.lead).toBe('Geschreven door Jacob den Hollander aan.');
    expect(JSON.stringify(card)).not.toMatch(/Jongen|hJongen1|⟦/);
  });
});

describe('§104 L1/L4: Onlangs bijgewerkt', () => {
  it('een speler: geen artikel van de Keeper, en van Jacob de versie van vóór het Keeper-tijdperk', () => {
    const cards = deps.leeskamer.recentlyUpdated(SPELER, 6, 10_000_000);
    expect(cards.map((c) => c.id)).toEqual(['jacob', 'vuurtoren', 'anneke', 'brief']);
    const jacob = cards[0];
    expect(jacob.at).toBe(2000);
    expect(jacob.by).toBe('Speler');
    // Dezelfde versie als de geschiedenis van de speler (`listRevisions`), en dus als *Bijgewerkt door*.
    expect(deps.entries.listRevisions('jacob', false)[0].createdAt).toBe(jacob.at);
  });
  it('de Keeper op de kant van de spelers ziet de nieuwste versie, maar geen artikel van zijn eigen kant', () => {
    const cards = deps.leeskamer.recentlyUpdated(KEEPER, 6, 10_000_000);
    expect(cards.map((c) => c.id)).not.toContain('jongen');
    expect(cards.find((c) => c.id === 'jacob')!.at).toBe(3000);
    expect(deps.entries.listRevisions('jacob', true)[0].createdAt).toBe(3000);
  });
  it('op zijn eigen kant: alleen zijn eigen', () => {
    expect(deps.leeskamer.recentlyUpdated(KEEPER_OWN_SIDE, 6).map((c) => c.id)).toEqual(['jongen']);
  });
  it('niemand ingelogd: niets', () => {
    expect(deps.leeskamer.recentlyUpdated(null)).toEqual([]);
  });
});
