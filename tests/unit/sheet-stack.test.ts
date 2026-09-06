import { beforeEach, describe, expect, it } from 'vitest';
import {
  SHEET_BASE_Z,
  closeSheet,
  isTopSheet,
  openSheet,
  openSheetCount,
  resetSheetStack,
  sheetDepth,
} from '@/lib/sheetStack';

/**
 * §18b: which sheet a key press belongs to.
 *
 * `Sheet` puts a portal on `<body>` and a capture listener on `document`, and
 * two of those listening at once is what turned "the archive asks who you are
 * writing as" into "Escape closes the sheet *under* the question". The pile
 * itself is the part worth pinning down: which sheet owns Escape, which sheet
 * owns the scrollbar, and which one paints on top.
 */

beforeEach(() => resetSheetStack());

describe('one sheet', () => {
  it('is the top, sits at the bottom of the pile, and is the only one open', () => {
    const id = openSheet();
    expect(isTopSheet(id)).toBe(true);
    expect(sheetDepth(id)).toBe(0);
    expect(openSheetCount()).toBe(1);
  });

  it('leaves nothing behind when it closes', () => {
    const id = openSheet();
    closeSheet(id);
    expect(openSheetCount()).toBe(0);
    expect(isTopSheet(id)).toBe(false);
  });
});

describe('a pile', () => {
  it('gives Escape to the sheet in front and nothing to the one behind', () => {
    // The whole bug: the blocking "Met wie ben je nu aan het schrijven?" opens
    // over "Nieuw artikel", refuses to close, and the same key press reaches
    // the sheet underneath — which does close, leaving the question standing
    // over a page nobody asked for.
    const under = openSheet();
    const over = openSheet();
    expect(isTopSheet(over)).toBe(true);
    expect(isTopSheet(under)).toBe(false);
  });

  it('hands the top back when the sheet in front goes', () => {
    const under = openSheet();
    const over = openSheet();
    closeSheet(over);
    expect(isTopSheet(under)).toBe(true);
    expect(openSheetCount()).toBe(1);
  });

  it('paints each one over the last', () => {
    // Two portals with the same z-index are ordered by whichever happened to
    // mount first — which is not a promise anybody should be relying on.
    const under = openSheet();
    const over = openSheet();
    expect(SHEET_BASE_Z + sheetDepth(under)).toBe(60);
    expect(SHEET_BASE_Z + sheetDepth(over)).toBe(61);
  });

  it('survives the one closing out of order, which is what actually happens', () => {
    // The sheet underneath can go first: it is the one whose Escape used to
    // land, and it is also the one a `needsAuthor` refusal was fired from.
    const under = openSheet();
    const over = openSheet();
    closeSheet(under);
    expect(openSheetCount()).toBe(1);
    expect(isTopSheet(over)).toBe(true);
    closeSheet(over);
    expect(openSheetCount()).toBe(0);
  });

  it('counts the scrollbar in and out exactly once', () => {
    // `<body>` has one scrollbar, so it is taken by the first sheet to open
    // and given back by the last to close. Each sheet saving and restoring
    // `overflow` for itself meant the first to unmount handed it back while a
    // sheet was still standing over the page.
    const first = openSheet();
    expect(openSheetCount()).toBe(1);
    const second = openSheet();
    closeSheet(first);
    expect(openSheetCount()).toBe(1);
    closeSheet(second);
    expect(openSheetCount()).toBe(0);
  });
});

describe('closing twice, and closing what was never open', () => {
  it('is harmless — React 19 Strict Mode mounts, unmounts and mounts again', () => {
    const id = openSheet();
    closeSheet(id);
    expect(() => closeSheet(id)).not.toThrow();
    expect(openSheetCount()).toBe(0);
    expect(sheetDepth(id)).toBe(0);
  });

  it('never hands the same token to two sheets', () => {
    const first = openSheet();
    closeSheet(first);
    const second = openSheet();
    expect(second).not.toBe(first);
    // …and a stale token from a sheet that has gone is never the top again.
    expect(isTopSheet(first)).toBe(false);
    expect(isTopSheet(second)).toBe(true);
  });
});
