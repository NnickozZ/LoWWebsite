import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { combinedSave, saveLabel, type RoomSave } from '@/components/entry/useAutosave';
import { safeReturnPath } from '@/lib/auth/paths';
import { wikiFilterGroups } from '@/lib/entries/browseFilters';
import { tagListHref } from '@/lib/entries/tagHref';
import { defaultIntro } from '@/lib/intro';
import { CHARACTER_TYPE_SLUG, fabTypeFor } from '@/lib/newEntryType';
import { DEFAULT_WORDS, fill } from '@/lib/words';

/**
 * §90, ronde 51 (`schrijven`): de deuren. The pure halves of what this round
 * changed — the rest is a page, and `tests/e2e/ronde-51-schrijven.spec.ts`
 * asks it there.
 */

const ROOT = join(__dirname, '..', '..');

describe('§90 S15: a deep link survives the login, and only onto this archive', () => {
  it('follows a `next` that stays here, path, query and fragment', () => {
    expect(safeReturnPath('/e/jan-kaland')).toBe('/e/jan-kaland');
    expect(safeReturnPath('/wiki/investigator?tag=haven')).toBe('/wiki/investigator?tag=haven');
  });

  it('sends every `next` that could leave the archive home', () => {
    for (const bad of ['/\\evil', '//evil', 'https://evil', '//evil.example/e/x', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeReturnPath(bad), bad).toBe('/');
    }
  });

  it('is the road loginAction takes — one helper, not a second', () => {
    const actions = readFileSync(join(ROOT, 'app', '(auth)', 'actions.ts'), 'utf8');
    expect(actions).toContain("redirect(safeReturnPath(String(formData.get('next') ?? '')))");
    // And the middleware carries the address it was asked for.
    const middleware = readFileSync(join(ROOT, 'middleware.ts'), 'utf8');
    expect(middleware).toContain("login.searchParams.set('next'");
  });
});

describe('§90 B21: a tag goes to the list, not the voordeur', () => {
  it('opens the soort’s own list, filtered', () => {
    expect(tagListHref('haven', 'character')).toBe('/wiki/character?tag=haven');
  });

  it('falls back to the whole wiki without a soort', () => {
    expect(tagListHref('haven')).toBe('/wiki/alles?tag=haven');
    expect(tagListHref('haven', null)).toBe('/wiki/alles?tag=haven');
  });

  it('encodes what a tag may hold', () => {
    expect(tagListHref('oude haven & kade', 'location')).toBe('/wiki/location?tag=oude%20haven%20%26%20kade');
  });

  it('keeps the chosen tag in the bar even when it is not among the fourteen most used', () => {
    const tags = Array.from({ length: 20 }, (_, i) => ({ tag: `t${i}`, count: 20 - i }));
    const [tagGroup] = wikiFilterGroups(tags, null, 't19');
    expect(tagGroup!.options.map((o) => o.value)).toContain('t19');
    expect(tagGroup!.options.find((o) => o.value === 't19')?.count).toBe(1);
    // Unknown to this list: still shown, with nothing counted.
    const [again] = wikiFilterGroups(tags, null, 'nergens');
    expect(again!.options.find((o) => o.value === 'nergens')?.count).toBe(0);
    // And nothing extra when nothing is chosen, or it is already there.
    expect(wikiFilterGroups(tags, null)[0]!.options).toHaveLength(14);
    expect(wikiFilterGroups(tags, null, 't0')[0]!.options).toHaveLength(14);
  });
});

describe('§90 B15: the one save word', () => {
  const live: RoomSave = { status: 'live', save: 'idle' };
  const typing: RoomSave = { status: 'live', save: 'saving' };
  const cut: RoomSave = { status: 'offline', save: 'saving' };
  const landed: RoomSave = { status: 'live', save: 'saved' };

  it('says "Opslaan…" while something is on its way on a good line', () => {
    expect(combinedSave({ state: 'idle', rooms: [typing, live], online: true, stuck: false })).toBe('saving');
    expect(combinedSave({ state: 'dirty', rooms: [live], online: true, stuck: false })).toBe('saving');
  });

  it('lets a line that is down outrank "Opslaan…"', () => {
    expect(combinedSave({ state: 'saving', rooms: [live], online: false, stuck: false })).toBe('offline');
    expect(combinedSave({ state: 'idle', rooms: [cut], online: true, stuck: false })).toBe('offline');
    expect(combinedSave({ state: 'saving', rooms: [live], online: true, stuck: true })).toBe('offline');
    expect(combinedSave({ state: 'offline', rooms: [live], online: true, stuck: false })).toBe('offline');
  });

  it('lets a refusal outrank everything', () => {
    expect(combinedSave({ state: 'error', rooms: [typing], online: false, stuck: true })).toBe('error');
  });

  it('says nothing about a line that is down when nothing is waiting', () => {
    expect(combinedSave({ state: 'saved', rooms: [landed], online: false, stuck: false })).toBe('saved');
    expect(combinedSave({ state: 'idle', rooms: [live], online: false, stuck: false })).toBe('idle');
  });

  it('reads the sentence from the word list', () => {
    expect(saveLabel('offline')).toBe('Nog niet opgeslagen — wordt bewaard zodra de verbinding terug is');
    expect(saveLabel('offline', { ...DEFAULT_WORDS, saveOffline: 'Nog niet binnen' })).toBe('Nog niet binnen');
    expect(saveLabel('saving')).toBe('Opslaan…');
    expect(saveLabel('saved')).toBe('Opgeslagen');
  });
});

describe('§90 E20 + S19: which soort the + opens on', () => {
  const slugs = ['character', 'investigator', 'location'];

  it('takes the soort of the wiki list you stand on', () => {
    expect(fabTypeFor({ pathname: '/wiki/location', typeSlugs: slugs, needsCharacter: false })).toBe('location');
    expect(fabTypeFor({ pathname: '/wiki/location/', typeSlugs: slugs, needsCharacter: false })).toBe('location');
  });

  it('leaves the voordeur, the whole list, an overzicht and anything else alone', () => {
    for (const pathname of ['/wiki', '/wiki/alles', '/wiki/overzicht/x', '/wiki/overzicht', '/', '/e/jan', '/cases']) {
      expect(fabTypeFor({ pathname, typeSlugs: slugs, needsCharacter: false }), pathname).toBeUndefined();
    }
  });

  it('never suggests a soort this person may not start (a Keeper’s huisraad)', () => {
    expect(fabTypeFor({ pathname: '/wiki/huisraad', typeSlugs: slugs, needsCharacter: false })).toBeUndefined();
  });

  it('opens on the karakter-soort for a speler with no karakter, wherever they stand', () => {
    expect(fabTypeFor({ pathname: '/', typeSlugs: slugs, needsCharacter: true })).toBe(CHARACTER_TYPE_SLUG);
    expect(fabTypeFor({ pathname: '/wiki/location', typeSlugs: slugs, needsCharacter: true })).toBe(CHARACTER_TYPE_SLUG);
    // …unless the archive has no such soort.
    expect(fabTypeFor({ pathname: '/', typeSlugs: ['character'], needsCharacter: true })).toBeUndefined();
  });
});

describe('§90: the words this round added', () => {
  it('fills its holes', () => {
    expect(fill(DEFAULT_WORDS.sectionWhoReads, { ding: 'artikel', sectie: 'sectie' })).toBe(
      'Iedereen die dit artikel mag lezen, ziet deze sectie.',
    );
    expect(fill(DEFAULT_WORDS.writingAsGoOn, { naam: 'Cornelis' })).toBe('Verder als Cornelis');
    expect(fill(DEFAULT_WORDS.passwordReset, { keeper: 'Keeper' })).toBe(
      'De Keeper kan een nieuw wachtwoord voor je instellen als je het vergeet.',
    );
    expect(DEFAULT_WORDS.coverMenu).toBe('Omslag');
  });

  it('S10: the welcome does not ask a phone to press n', () => {
    expect(defaultIntro(DEFAULT_WORDS)).not.toMatch(/druk op n/i);
    expect(defaultIntro(DEFAULT_WORDS)).toContain('+');
  });

  it('S16: no card at the door still calls the archive "Case Files"', () => {
    for (const page of ['login', 'signup']) {
      const source = readFileSync(join(ROOT, 'app', '(auth)', page, 'page.tsx'), 'utf8');
      expect(source, page).not.toContain('Case Files');
      expect(source, page).not.toContain('Zeeland &middot; 1934');
      expect(source, page).toContain('siteIdentity()');
    }
    for (const file of [join('app', '(auth)', 'AuthForm.tsx'), join('app', '(app)', 'you', 'page.tsx')]) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toContain('wachtwoord terughalen');
    }
  });
});
