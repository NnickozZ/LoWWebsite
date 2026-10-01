import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIRST_VISIT_PLACES,
  firstVisitKey,
  formatInvite,
  inviteLink,
  isNewAccount,
  FIRST_VISIT_DAYS,
  normaliseInvite,
  routeSteps,
  seenPlaces,
  showsRoute,
  withSeen,
} from '@/lib/eerste-keer/stappen';
import { DEFAULT_WORDS, WORD_GROUPS, WORD_MAX, fill } from '@/lib/words';

/**
 * §106 (golf i2): de eerste keer. De pure helft (`lib/eerste-keer/stappen.ts`),
 * de woorden, en een paar regels die alleen in de bron te zien zijn.
 */
const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

describe('§106: de uitnodigingscode zoals een mens hem plakt', () => {
  it('laat alleen letters en cijfers over, in hoofdletters', () => {
    expect(normaliseInvite('abcde-23456')).toBe('ABCDE23456');
    expect(normaliseInvite('  ABCDE 23456\n')).toBe('ABCDE23456');
    expect(normaliseInvite('AB-CDE–234 56')).toBe('ABCDE23456');
  });

  it('zet geen O om in een 0: een verkeerde letter blijft verkeerd', () => {
    expect(normaliseInvite('OOOOO-IIIII')).toBe('OOOOOIIIII');
  });

  it('toont hem als vijf, streepje, vijf zodra er meer dan vijf staan', () => {
    expect(formatInvite('abcd')).toBe('ABCD');
    expect(formatInvite('abcde')).toBe('ABCDE');
    expect(formatInvite('abcde2')).toBe('ABCDE-2');
    expect(formatInvite('abcde 23456')).toBe('ABCDE-23456');
    expect(formatInvite('ABCDE-23456')).toBe('ABCDE-23456');
    // Te lang: laten staan, niet stil afknippen.
    expect(formatInvite('abcde234567')).toBe('ABCDE234567');
  });

  it('elke code die makeInviteCode maakt, blijft na het vormen dezelfde', async () => {
    const { makeInviteCode } = await import('@/lib/db/seed.mjs');
    for (let i = 0; i < 50; i++) {
      const code = makeInviteCode() as string;
      expect(formatInvite(code)).toBe(code);
      expect(normaliseInvite(formatInvite(code.toLowerCase().replace('-', ' ')))).toBe(normaliseInvite(code));
    }
  });

  it('de link zet de code in het vak, met het streepje', () => {
    expect(inviteLink('https://archief.nl/', 'abcde23456')).toBe('https://archief.nl/signup?code=ABCDE-23456');
    expect(inviteLink('', 'ABCDE-23456')).toBe('/signup?code=ABCDE-23456');
  });

  it('de server vergelijkt de genormaliseerde code, aan beide kanten', () => {
    const actions = read('app', '(auth)', 'actions.ts');
    expect(actions).toContain('constantTimeEqual(normaliseInvite(code), normaliseInvite(settings.inviteCode))');
  });
});

describe('§106: de route van een verse Keeper', () => {
  it('drie stappen in vaste volgorde, gedaan zodra het archief het heeft', () => {
    expect(routeSteps({ entries: 0, cases: 0, players: 0 })).toEqual([
      { key: 'entry', done: false },
      { key: 'case', done: false },
      { key: 'invite', done: false },
    ]);
    expect(routeSteps({ entries: 3, cases: 0, players: 1 }).map((step) => step.done)).toEqual([true, false, true]);
  });

  it('verdwijnt als alle drie gedaan zijn, en niet eerder', () => {
    expect(showsRoute({ entries: 0, cases: 0, players: 0 })).toBe(true);
    expect(showsRoute({ entries: 1, cases: 1, players: 0 })).toBe(true);
    expect(showsRoute({ entries: 1, cases: 1, players: 1 })).toBe(false);
    expect(showsRoute({ entries: 200, cases: 5, players: 6 })).toBe(false);
  });

  it('wordt alleen voor de Keeper geteld, en de code gaat alleen naar de Keeper', () => {
    const start = read('app', '(app)', 'page.tsx');
    expect(start).toContain('user?.isKeeper ? archiveFirsts() : null');
    const hal = read('app', '(app)', 'spelers', 'page.tsx');
    expect(hal).toMatch(/user\?\.isKeeper && spelers\.every/);
  });
});

describe('§106: de eerste bezoeken', () => {
  it('één sleutel per plek, per browser', () => {
    expect(FIRST_VISIT_PLACES).toEqual(['kamer', 'winkel', 'wiki']);
    expect(new Set(FIRST_VISIT_PLACES.map(firstVisitKey)).size).toBe(3);
  });

  it('leest en schrijft localStorage alleen in try/catch', () => {
    const source = read('components', 'eerste-keer', 'EersteBezoek.tsx');
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(!eligible\) return;\s*try \{/);
    expect(source).toContain('} catch {');
    expect(source).toContain('window.localStorage.setItem(key');
  });

  it('de server leest alleen de spiegel, zodat de regel er meteen staat en niets verschuift', () => {
    expect([...seenPlaces('kamer.wiki.onzin')]).toEqual(['kamer', 'wiki']);
    expect(seenPlaces(undefined).size).toBe(0);
    expect(withSeen('wiki', 'kamer')).toBe('kamer.wiki');
    expect(withSeen('kamer.wiki', 'wiki')).toBe('kamer.wiki');
    for (const page of [['kamer', '[slug]', 'page.tsx'], ['winkel', 'page.tsx'], ['wiki', 'page.tsx']]) {
      expect(read('app', '(app)', ...page)).toMatch(/\{\.\.\.\(await firstVisitOffer\('(kamer|winkel|wiki)', user\)\)\}/);
    }
  });
});

describe('§106: de woorden', () => {
  const group = WORD_GROUPS.find((g) => g.title === 'De eerste keer (golf I)');

  it('staan in hun eigen groep, onder de markering van golf i2', () => {
    expect(group).toBeDefined();
    const words = read('lib', 'words.ts');
    const marker = words.indexOf('// ── golf i2');
    expect(marker).toBeGreaterThan(0);
    expect(words.indexOf("title: 'De eerste keer (golf I)'")).toBeGreaterThan(marker);
    expect(words.indexOf("title: 'De eerste keer (golf I)'")).toBeLessThan(words.indexOf('// ── golf i3'));
  });

  it('zijn kort genoeg, zonder uitroepteken en zonder emoji', () => {
    for (const def of group!.words) {
      expect(def.fallback.length, def.key).toBeLessThanOrEqual(WORD_MAX);
      expect(def.fallback, def.key).not.toContain('!');
      expect(def.fallback, def.key).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('een deur in een lege staat heet anders dan de knop bovenaan de lijst', () => {
    // Playwright en een schermlezer vinden de knop bovenaan op een stuk van zijn naam.
    const pairs: [string, string][] = [
      [fill(DEFAULT_WORDS.emptyBoardsGo, { prikbord: DEFAULT_WORDS.board }), `Nieuw ${DEFAULT_WORDS.board}`],
      [fill(DEFAULT_WORDS.emptyTimelinesGo, { tijdlijn: DEFAULT_WORDS.timeline }), `Nieuwe ${DEFAULT_WORDS.timeline}`],
      [fill(DEFAULT_WORDS.emptyTreesGo, { stamboom: DEFAULT_WORDS.familyTree }), `Nieuwe ${DEFAULT_WORDS.familyTree}`],
      [fill(DEFAULT_WORDS.emptyMapsGo, { landkaart: DEFAULT_WORDS.map }), `${DEFAULT_WORDS.map} ophangen`],
      [fill(DEFAULT_WORDS.emptyCasesGo, { dossier: DEFAULT_WORDS.case }), 'Dossier openen'],
      [fill(DEFAULT_WORDS.emptyCasesGo, { dossier: DEFAULT_WORDS.case }), 'Nieuw dossier'],
      [fill(DEFAULT_WORDS.routeCase, { dossier: DEFAULT_WORDS.case }), 'Dossier openen'],
      [fill(DEFAULT_WORDS.emptyWrite, { artikel: DEFAULT_WORDS.entry }), DEFAULT_WORDS.newEntry],
      [fill(DEFAULT_WORDS.welcomeWrite, { artikel: DEFAULT_WORDS.entry }), DEFAULT_WORDS.newEntry],
      [DEFAULT_WORDS.whoAtTableGo, 'Aanmaken'],
    ];
    for (const [door, header] of pairs) {
      expect(door.toLowerCase(), door).not.toContain(header.toLowerCase());
    }
  });
});

describe('§106: één familie van lege staten', () => {
  const pages = [
    ['app', '(app)', 'cases', 'page.tsx'],
    ['app', '(app)', 'boards', 'page.tsx'],
    ['app', '(app)', 'maps', 'page.tsx'],
    ['app', '(app)', 'timelines', 'page.tsx'],
    ['app', '(app)', 'stambomen', 'page.tsx'],
    ['app', '(app)', 'wiki', 'alles', 'page.tsx'],
    ['app', '(app)', 'wiki', '[type]', 'page.tsx'],
    // Golf O: Start has no list any more (no feed, no open dossiers), so no empty state either.
    ['components', 'cases', 'CaseDossier.tsx'],
  ];

  it('elke lijst tekent zijn lege staat met LegeStaat, niet met een los stippelkader', () => {
    for (const parts of pages) {
      const source = read(...parts);
      expect(source, parts.join('/')).toContain('<LegeStaat');
      expect(source, parts.join('/')).not.toContain('className="empty"');
    }
  });

  it('een deur drukt op de knop die er al was: MAKE_EVENT, openNewEntry of openNewCase', () => {
    const doors = read('components', 'eerste-keer', 'Deuren.tsx');
    expect(doors).toContain('new Event(MAKE_EVENT)');
    expect(doors).toContain('ui.openNewEntry(');
    expect(doors).toContain('ui.openNewCase(');
    expect(doors).not.toContain('fetch(');
  });

  it('LegeStaat typt zelf geen zin (§11)', () => {
    const source = read('components', 'ui', 'LegeStaat.tsx');
    const body = source.slice(source.indexOf('return ('));
    expect(body).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]/);
  });
});

describe('§106: wie ben jij aan tafel?', () => {
  const source = read('components', 'eerste-keer', 'WieBenJij.tsx');

  it('gaat langs de twee schrijfwegen die er al waren', () => {
    expect(source).toContain("fetch('/api/entries'");
    expect(source).toContain('typeSlug: CHARACTER_TYPE_SLUG');
    expect(source).toContain("fetch('/api/characters'");
  });

  it('neemt de schrijfkeuze van dit venster mee (§91), en vraagt §18b dus niet nog eens', () => {
    expect(source).toContain('author?.followPlay(entry.id)');
  });

  it('de ene regel staat niet op Start, want daar staat de vraag zelf', () => {
    const banner = read('components', 'you', 'AuthorProvider.tsx');
    expect(banner).toContain("if (pathname === '/') return null;");
    expect(banner).toContain('data-testid="no-author-banner"');
  });
});

describe('§106 na review 4', () => {
  it('M9: het eerste bezoek is voor een nieuw account, niet voor een nieuw toestel', () => {
    const now = Date.UTC(2026, 8, 28);
    const days = (n: number) => Math.floor((now - n * 86_400_000) / 1000);
    expect(FIRST_VISIT_DAYS).toBe(14);
    expect(isNewAccount(days(0), now)).toBe(true);
    expect(isNewAccount(days(13), now)).toBe(true);
    expect(isNewAccount(days(15), now)).toBe(false);
    expect(isNewAccount(days(200), now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
    const source = read('components', 'eerste-keer', 'EersteBezoek.tsx');
    expect(source).toContain('useState(eligible && firstUnseen)');
    expect(source).toContain('if (!eligible) return;');
  });

  it('M6: het welkom ís jouw plek, en hover alleen waar een muis zweeft', () => {
    const css = read('app', 'eerste-keer.css');
    expect(css).toContain('.home-layout:has(> .wie-welkom) > .home-jij');
    const globals = read('app', 'globals.css');
    expect(globals).toMatch(/@media \(hover: hover\) \{\s*\.btn:hover:not\(:disabled\)/);
    expect(globals).not.toMatch(/^\.btn:hover/m);
    expect(globals).not.toMatch(/^\.chip-selectable:hover/m);
    const welkom = read('components', 'eerste-keer', 'WieBenJij.tsx');
    expect(welkom).not.toContain('disabled={!author?.mayType}');
    expect(welkom).toContain('aria-busy={writeWaiting || undefined}');
  });

  it('M7: een koppeling leest "schoof aan", niet "wijzigde"', () => {
    // Golf O: the feed left Start, and with it the one reader of this verb;
    // the word stays for the day a feed comes back.
    expect(DEFAULT_WORDS.feedSatDown).toBe('schoof aan');
  });

  it('M8: geen getallen onder de route, geen sorteerbalk boven niets, het web heeft een lege staat', () => {
    expect(read('app', '(app)', 'page.tsx')).toContain('{!route && (');
    for (const parts of [
      ['app', '(app)', 'cases', 'page.tsx'],
      ['app', '(app)', 'boards', 'page.tsx'],
      ['app', '(app)', 'maps', 'page.tsx'],
      ['app', '(app)', 'timelines', 'page.tsx'],
      ['app', '(app)', 'stambomen', 'page.tsx'],
      ['app', '(app)', 'wiki', 'alles', 'page.tsx'],
      ['app', '(app)', 'wiki', '[type]', 'page.tsx'],
    ]) {
      expect(read(...parts), parts.join('/')).toContain('geen sorteerbalk boven een lijst zonder één regel');
    }
    expect(read('components', 'web', 'WebView.tsx')).toContain('<LegeStaat icon="web"');
  });

  it('M12: de stempel op de voordeur ligt stil en landt alleen bij een inschrijving', () => {
    const css = read('app', 'eerste-keer.css');
    expect(css).toMatch(/\.voordeur-inschrijven:has\(form\[aria-busy='true'\]\) \.voordeur-stempel \{\s*animation/);
    expect(read('app', '(auth)', 'AuthForm.tsx')).toContain('placeholder="XXXXX-XXXXX"');
  });
});
