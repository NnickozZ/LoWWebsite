import { capitalise, fill, type Words } from '@/lib/words';

/**
 * §100: de handelingen van het palet — wat je kunt *doen*, naast wat je kunt
 * vinden.
 *
 * Puur, zodat "wie krijgt welke" in een test gelezen kan worden: dit bouwt
 * beschrijvingen, het palet voert ze uit met de openers die er al zijn
 * (`openNewEntry`/`openNewCase` van `UiProvider`, de maakbladen van de vier
 * vlakken via `?maak=1` op hun lijst, `useWardrobe`'s wissel, `FLIP_EVENT`
 * voor de kant). Er komt hier geen tweede weg naar iets bij.
 *
 * §44: wat alleen van de Keeper is, zit **niet** in de lijst van een speler —
 * niet uitgezet, afwezig. En de server weigert toch; de lijst is beleefdheid.
 */

export type PaletteRun =
  | { kind: 'href'; href: string }
  | { kind: 'new-entry' }
  | { kind: 'new-case' }
  /** Naar de lijst van dat vlak, die zijn eigen maakblad opent. */
  | { kind: 'make'; href: string }
  | { kind: 'flip' }
  | { kind: 'play'; characterId: string | null };

export type PaletteAction = {
  key: string;
  label: string;
  icon: string;
  run: PaletteRun;
};

export type PaletteRole = {
  words: Words;
  /** §44/§48: een echte Keeper die niet als speler kijkt. */
  keeperHere: boolean;
  /** §18b: mag dit venster iets schrijven? Zonder onderzoeker alleen het eerste artikel. */
  mayType: boolean;
  /** De kamer van wie je speelt, of null (§84). */
  purse: { slug: string; roomId: string } | null;
  myPage: string | null;
  /** Je karakters, en wie je nu speelt. Leeg voor de Keeper (§18). */
  characters: readonly { entryId: string; name: string }[];
  activeId: string | null;
  /** Aan welke kant de Keeper staat, voor het woord van de wissel. */
  side: 'keeper' | 'player';
  /** §48: het dossier waar je in staat — dan staat er "in dit dossier" bij. */
  caseHereName?: string | null;
};

export function paletteActions(role: PaletteRole): PaletteAction[] {
  const { words } = role;
  const out: PaletteAction[] = [];

  out.push({
    key: 'new-entry',
    label: role.caseHereName ? `${words.newEntry} in dit ${words.case}` : words.newEntry,
    icon: 'plus',
    run: { kind: 'new-entry' },
  });
  if (role.mayType) {
    out.push({ key: 'new-case', label: fill(words.actNewCase, { dossier: words.case }), icon: 'folder', run: { kind: 'new-case' } });
    out.push({
      key: 'new-board',
      label: fill(words.actNewBoard, { prikbord: words.board }),
      icon: 'board',
      run: { kind: 'make', href: '/boards?maak=1' },
    });
    out.push({
      key: 'new-timeline',
      label: fill(words.actNewTimeline, { tijdlijn: words.timeline }),
      icon: 'timeline',
      run: { kind: 'make', href: '/timelines?maak=1' },
    });
    out.push({
      key: 'new-tree',
      label: fill(words.actNewTree, { stamboom: words.familyTree }),
      icon: 'tree',
      run: { kind: 'make', href: '/stambomen?maak=1' },
    });
  }
  // §17: a landkaart is hung by the Keeper alone; the button is on /maps for nobody else.
  if (role.keeperHere) {
    out.push({
      key: 'new-map',
      label: fill(words.actNewMap, { landkaart: words.map }),
      icon: 'map',
      run: { kind: 'make', href: '/maps?maak=1' },
    });
  }

  if (role.purse) {
    out.push({
      key: 'kamer',
      label: fill(words.toRoom, { kamer: words.room }),
      icon: 'home',
      run: { kind: 'href', href: `/kamer/${role.purse.slug}` },
    });
    out.push({
      key: 'winkel',
      label: fill(words.toShop, { winkel: words.shop.toLowerCase() }),
      icon: 'shop',
      // §90 (E2): de winkel van de kamer die je speelt, zoals de zijbalk.
      run: { kind: 'href', href: `/winkel?kamer=${encodeURIComponent(role.purse.roomId)}` },
    });
  }
  if (role.myPage && (role.purse || role.keeperHere)) {
    out.push({
      key: 'mine',
      label: fill(words.navMyPage, { spelerspagina: words.spelerPage.toLowerCase() }),
      icon: 'person',
      run: { kind: 'href', href: role.myPage },
    });
  }
  out.push({ key: 'spelers', label: capitalise(words.playerPlural), icon: 'badge', run: { kind: 'href', href: '/spelers' } });

  // §91: every wissel goes through `useWardrobe`, which calls `followPlay`.
  if (!role.keeperHere) {
    for (const character of role.characters) {
      if (character.entryId === role.activeId) continue;
      out.push({
        key: `play-${character.entryId}`,
        label: fill(words.actPlayAs, { naam: character.name }),
        icon: 'mask',
        run: { kind: 'play', characterId: character.entryId },
      });
    }
    if (role.characters.length && role.activeId !== null) {
      out.push({ key: 'play-self', label: words.asYourself, icon: 'you', run: { kind: 'play', characterId: null } });
    }
  }

  if (role.keeperHere) {
    out.push({
      key: 'flip',
      label: role.side === 'keeper' ? words.toPlayerSide : words.toKeeperSide,
      icon: role.side === 'keeper' ? 'you' : 'shield',
      run: { kind: 'flip' },
    });
    out.push({ key: 'uitdelen', label: words.handout, icon: 'gift', run: { kind: 'href', href: '/uitdelen' } });
    out.push({ key: 'admin', label: words.navAdmin, icon: 'shield', run: { kind: 'href', href: '/admin' } });
  }

  out.push({ key: 'settings', label: words.navSettings, icon: 'gear', run: { kind: 'href', href: '/you' } });
  return out;
}

/** Lowercase, without accents: "Ga naar de kamer" and "kamer" meet, and so do "é" and "e". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

/**
 * Which handelingen fit what was typed. Every word typed must begin a word of
 * the label ("nie pri" → *Nieuw prikbord*), so a short query narrows rather
 * than matches everything with an "e" in it. Order is kept: it is the order
 * above, which is the order of how often a hand wants each.
 */
export function filterActions(actions: readonly PaletteAction[], query: string): PaletteAction[] {
  const tokens = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!tokens.length) return [...actions];
  return actions.filter((action) => {
    const words = fold(action.label).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  });
}

/** `>` first: only handelingen, the rest of the text filters them. */
export function paletteMode(query: string): { actionsOnly: boolean; text: string } {
  const trimmed = query.replace(/^\s+/, '');
  if (trimmed.startsWith('>')) return { actionsOnly: true, text: trimmed.slice(1).trim() };
  return { actionsOnly: false, text: query.trim() };
}
