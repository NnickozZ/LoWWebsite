import { describe, expect, it } from 'vitest';
import {
  flipRoad,
  hereFrom,
  planFlip,
  readLanding,
  switchedMessage,
  SWITCHED_PARAM,
  TWINLESS_PARAM,
} from '@/components/keeper/flipRoad';
import { DEFAULT_WORDS, resolveWords } from '@/lib/words';

/**
 * §57: de knop weet weer waar hij staat.
 *
 * The bug: flip on a Keeper page with no tweeling and you land on `/wiki` —
 * right address, right cookie — but the button top right still said Keeper, the
 * shield was still under the masthead and the page was still painted in the
 * Keeper's colours, because `router.push` re-renders the page segment and
 * reuses the shared layout's RSC output. Worse than cosmetic: `UiProvider`'s
 * stale `side` is §48's born-on-a-side, so the next artikel made from that
 * screen was born keeper-only while the cookie said player.
 *
 * The cure is a road, not a repair: every flip is a document load through
 * `GET /api/keeper/flip`, the one writer of the cookie, exactly as §50's
 * `sideDetour` already did it. The two decisions the button still makes are
 * pure, and they are what is pinned here — where a press goes, and what the
 * landing says.
 */

const words = DEFAULT_WORDS;

describe('§57 waar een druk op de knop heen gaat', () => {
  it('een tweeling: naar de tweeling, en naar de kant van die tweeling', () => {
    const plan = planFlip({ flipTo: '/e/het-complot', twinless: false, markSide: 'player' }, 'player', '/e/de-veerman');
    expect(plan).toEqual({ next: 'keeper', to: '/e/het-complot', twinless: false });
    // And back the other way: the mark's side decides, not the browser's.
    expect(planFlip({ flipTo: '/e/de-veerman', twinless: false, markSide: 'keeper' }, 'keeper', '/e/het-complot')).toEqual(
      { next: 'player', to: '/e/de-veerman', twinless: false },
    );
  });

  it('geen tweeling: naar de lijst, en dat wordt onthouden', () => {
    expect(planFlip({ flipTo: '/wiki', twinless: true, markSide: 'keeper' }, 'keeper', '/e/het-complot')).toEqual({
      next: 'player',
      to: '/wiki',
      twinless: true,
    });
    // The other direction is the same shape: a player-facing tijdlijn with no
    // Keeperversie lands on the list of tijdlijnen, on the Keeper's side.
    expect(planFlip({ flipTo: '/timelines', twinless: true, markSide: 'player' }, 'player', '/timelines/de-nacht')).toEqual(
      { next: 'keeper', to: '/timelines', twinless: true },
    );
  });

  it('geen merkteken: blijf staan, en lees deze pagina van de andere kant', () => {
    expect(planFlip(null, 'player', '/wiki')).toEqual({ next: 'keeper', to: '/wiki', twinless: false });
    expect(planFlip(null, 'keeper', '/wiki?soort=locatie')).toEqual({
      next: 'player',
      to: '/wiki?soort=locatie',
      twinless: false,
    });
  });

  it('de weg is altijd de GET-route, met de vlaggen erop', () => {
    expect(flipRoad({ next: 'keeper', to: '/e/het-complot', twinless: false })).toBe(
      `/api/keeper/flip?side=keeper&to=%2Fe%2Fhet-complot&${SWITCHED_PARAM}=1`,
    );
    expect(flipRoad({ next: 'player', to: '/wiki', twinless: true })).toBe(
      `/api/keeper/flip?side=player&to=%2Fwiki&${SWITCHED_PARAM}=1&${TWINLESS_PARAM}=1`,
    );
    // A query and a hash on the address we are standing on survive the trip.
    expect(flipRoad({ next: 'player', to: '/e/de-veerman?rev=3#nota', twinless: false })).toContain(
      'to=%2Fe%2Fde-veerman%3Frev%3D3%23nota',
    );
  });

  it('de vlaggen van een vorige landing rijden niet mee', () => {
    expect(hereFrom({ pathname: '/wiki', search: `?${SWITCHED_PARAM}=1`, hash: '' })).toBe('/wiki');
    expect(
      hereFrom({ pathname: '/wiki', search: `?soort=locatie&${SWITCHED_PARAM}=1&${TWINLESS_PARAM}=1`, hash: '#top' }),
    ).toBe('/wiki?soort=locatie#top');
    expect(hereFrom({ pathname: '/', search: '', hash: '' })).toBe('/');
  });

  it('een landing leest zichzelf', () => {
    expect(readLanding('?gewisseld=1')).toEqual({ switched: true, twinless: false });
    expect(readLanding('?gewisseld=1&zondertweeling=1')).toEqual({ switched: true, twinless: true });
    // Nothing said unless the flip said it: `zondertweeling` alone is not a wissel.
    expect(readLanding('?zondertweeling=1')).toEqual({ switched: false, twinless: true });
    expect(readLanding('')).toEqual({ switched: false, twinless: false });
  });
});

describe('§57 wat de landing zegt', () => {
  it('gewoon: waar je nu staat', () => {
    expect(switchedMessage('player', false, words)).toBe('Je staat nu aan de spelerskant.');
    expect(switchedMessage('keeper', false, words)).toBe('Je staat nu aan de Keeperkant.');
  });

  it('zonder tweeling: waarom je op een lijst staat, en waar je nu bent', () => {
    expect(switchedMessage('player', true, words)).toBe(
      'Er is geen Spelersversie van deze pagina — je staat nu aan de spelerskant.',
    );
    expect(switchedMessage('keeper', true, words)).toBe(
      'Er is geen Keeperversie van deze pagina — je staat nu aan de Keeperkant.',
    );
  });

  it('elk woord erin is van de Keeper', () => {
    const renamed = resolveWords({
      keeperSide: 'Meesterkant',
      playerSide: 'tafelkant',
      keeperVersion: 'Meesterblad',
      playerVersion: 'Tafelblad',
    });
    expect(switchedMessage('player', true, renamed)).toBe(
      'Er is geen Tafelblad van deze pagina — je staat nu aan de tafelkant.',
    );
    expect(switchedMessage('keeper', false, renamed)).toBe('Je staat nu aan de Meesterkant.');
  });
});
