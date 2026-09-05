import { describe, expect, it } from 'vitest';
import { cleanTabTypes, planCaseTabs, type CaseTabSource } from '@/lib/cases/tabs';

/**
 * §30: which soorten a dossier has tabs for.
 *
 * The whole point of the feature is that a fresh investigation can be given
 * the shelves it is going to need before anything is on them. The whole point
 * of the *rule* is that giving it those shelves can never take one away: a
 * soort the Keeper left out but which has something filed in this dossier keeps
 * its tab, always. These tests are that promise in both directions.
 */

const TAB_ORDER = ['people', 'item', 'clue', 'location', 'object', 'abnormality'];

function source(
  key: string,
  count: number,
  sortOrder: number,
  typeSlugs = [key],
): CaseTabSource {
  return { key, typeSlugs, count, sortOrder };
}

/** A dossier with a person and a place in it, and four empty soorten besides. */
const SOURCES: CaseTabSource[] = [
  source('people', 2, 0, ['character', 'investigator']),
  source('item', 0, 2),
  source('clue', 0, 3),
  source('location', 1, 4),
  source('object', 0, 5),
  source('abnormality', 0, 6),
];

const keys = (tabs: { key: string }[]) => tabs.map((tab) => tab.key);

describe('planCaseTabs, on automatic', () => {
  it('is exactly what a dossier did before there was a list', () => {
    // Null is the default and every dossier in the archive has it: only the
    // soorten with something filed here, in the app's own running order.
    expect(keys(planCaseTabs(SOURCES, null, TAB_ORDER))).toEqual(['people', 'location']);
  });

  it('pins nothing', () => {
    for (const tab of planCaseTabs(SOURCES, null, TAB_ORDER)) expect(tab.pinned).toBe(false);
  });

  it('falls back on the soort own order for anything TAB_ORDER has no opinion about', () => {
    const extras = [source('ritual', 1, 9), source('vessel', 1, 7)];
    expect(keys(planCaseTabs(extras, null, TAB_ORDER))).toEqual(['vessel', 'ritual']);
  });
});

describe('planCaseTabs, with soorten chosen', () => {
  it('gives an empty chosen soort a tab of its own', () => {
    const tabs = planCaseTabs(SOURCES, ['clue'], TAB_ORDER);
    expect(keys(tabs)).toContain('clue');
    expect(tabs.find((tab) => tab.key === 'clue')?.pinned).toBe(true);
  });

  it('never loses a soort that has something filed here', () => {
    // The Keeper asked for clues only. The people and the location are still
    // in this dossier, so their shelves stay — nothing filed can be hidden.
    const tabs = planCaseTabs(SOURCES, ['clue'], TAB_ORDER);
    expect(keys(tabs)).toEqual(['clue', 'people', 'location']);
    expect(tabs.find((tab) => tab.key === 'people')?.pinned).toBe(false);
  });

  it('keeps the Keeper order first, then TAB_ORDER underneath', () => {
    const tabs = planCaseTabs(SOURCES, ['object', 'clue'], TAB_ORDER);
    // The two chosen soorten stand in the order they were chosen in; what is
    // left sorts by TAB_ORDER as it always did.
    expect(keys(tabs)).toEqual(['object', 'clue', 'people', 'location']);
  });

  it('pins the merged Personen tab when either of its soorten is chosen', () => {
    const tabs = planCaseTabs(SOURCES, ['investigator'], TAB_ORDER);
    expect(tabs.find((tab) => tab.key === 'people')?.pinned).toBe(true);
    expect(keys(tabs)[0]).toBe('people');
  });

  it('drops nothing and adds nothing when the list names every soort', () => {
    const all = ['character', 'item', 'clue', 'location', 'object', 'abnormality'];
    expect(keys(planCaseTabs(SOURCES, all, TAB_ORDER))).toEqual([
      'people',
      'item',
      'clue',
      'location',
      'object',
      'abnormality',
    ]);
  });

  it('ignores a slug for a soort that no longer exists', () => {
    // A soort deleted in Beheer leaves its slug behind in some dossier's list.
    // It cannot conjure a tab, because there is no source to pin.
    expect(keys(planCaseTabs(SOURCES, ['seance'], TAB_ORDER))).toEqual(['people', 'location']);
  });

  it('does not depend on the order the caller built its sources in', () => {
    const shuffled = [...SOURCES].reverse();
    expect(keys(planCaseTabs(shuffled, ['clue'], TAB_ORDER))).toEqual([
      'clue',
      'people',
      'location',
    ]);
  });
});

describe('cleanTabTypes', () => {
  const known = ['character', 'item', 'clue', 'location'];

  it('keeps the Keeper order, because that order is the tab order', () => {
    expect(cleanTabTypes(['clue', 'character'], known)).toEqual(['clue', 'character']);
  });

  it('drops slugs for soorten that do not exist', () => {
    expect(cleanTabTypes(['clue', 'seance'], known)).toEqual(['clue']);
  });

  it('drops duplicates rather than giving a soort two tabs', () => {
    expect(cleanTabTypes(['clue', 'clue'], known)).toEqual(['clue']);
  });

  it('reads an empty list as automatic, not as a dossier with no tabs', () => {
    expect(cleanTabTypes([], known)).toBeNull();
    expect(cleanTabTypes(['seance'], known)).toBeNull();
  });

  it('reads null and rubbish as automatic', () => {
    expect(cleanTabTypes(null, known)).toBeNull();
    expect(cleanTabTypes(undefined, known)).toBeNull();
    expect(cleanTabTypes('clue', known)).toBeNull();
    expect(cleanTabTypes({ 0: 'clue' }, known)).toBeNull();
  });

  it('drops anything in the list that is not a string', () => {
    expect(cleanTabTypes(['clue', 7, null, { slug: 'item' }], known)).toEqual(['clue']);
  });
});
