import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDraft,
  readDraft,
  resetDrafts,
  writeDraft,
  DRAFT_CASE,
  DRAFT_ENTRY,
} from '@/lib/sheetDraft';

/**
 * §69 (4.5): wat je typte blijft staan als het blad dichtvalt.
 *
 * The store is module state with a page's lifetime, exactly like
 * `lib/sheetStack.ts` and `lib/popoverStack.ts` — which is also why every test
 * here has to put it back (`resetDrafts`), and why the module exports that at
 * all.
 */

beforeEach(() => resetDrafts());

describe('§69 het klad van een blad', () => {
  it('geeft een leeg klad terug voor een blad waar niets in staat', () => {
    // Never null: the sheet reads fields straight off it at mount.
    expect(readDraft(DRAFT_ENTRY)).toEqual({});
  });

  it('onthoudt wat er getypt is, per blad', () => {
    writeDraft(DRAFT_ENTRY, { name: 'Pier', description: 'De man van de pier' });
    writeDraft(DRAFT_CASE, { name: 'De storm' });
    expect(readDraft(DRAFT_ENTRY)).toEqual({ name: 'Pier', description: 'De man van de pier' });
    expect(readDraft(DRAFT_CASE)).toEqual({ name: 'De storm' });
  });

  it('gooit lege velden weg in plaats van ze te onthouden', () => {
    writeDraft(DRAFT_ENTRY, { name: 'Pier', description: '' });
    expect(readDraft(DRAFT_ENTRY)).toEqual({ name: 'Pier' });
  });

  it('vergeet een klad dat alleen nog uit spaties bestaat', () => {
    // "Did I leave something in that sheet" has one answer, not two.
    writeDraft(DRAFT_ENTRY, { name: 'Pier' });
    writeDraft(DRAFT_ENTRY, { name: '   ', description: '' });
    expect(readDraft(DRAFT_ENTRY)).toEqual({});
  });

  it('vervangt het klad, het vult het niet aan', () => {
    // The sheet writes both boxes on every keystroke, so a merge would keep a
    // description the person has just emptied.
    writeDraft(DRAFT_ENTRY, { name: 'Pier', description: 'weg hiermee' });
    writeDraft(DRAFT_ENTRY, { name: 'Pier', description: '' });
    expect(readDraft(DRAFT_ENTRY)).toEqual({ name: 'Pier' });
  });

  it('laat zich wissen als het ding gemaakt is', () => {
    writeDraft(DRAFT_ENTRY, { name: 'Pier' });
    clearDraft(DRAFT_ENTRY);
    expect(readDraft(DRAFT_ENTRY)).toEqual({});
  });

  it('houdt de twee bladen uit elkaar als er één gewist wordt', () => {
    writeDraft(DRAFT_ENTRY, { name: 'Pier' });
    writeDraft(DRAFT_CASE, { name: 'De storm' });
    clearDraft(DRAFT_ENTRY);
    expect(readDraft(DRAFT_CASE)).toEqual({ name: 'De storm' });
  });

  it('heeft twee sleutels, en die zijn niet dezelfde', () => {
    // Named constants rather than strings at the call site: a third sheet that
    // wants one has to come here and think about it.
    expect(DRAFT_ENTRY).not.toBe(DRAFT_CASE);
  });
});
