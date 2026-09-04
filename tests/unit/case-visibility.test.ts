import { describe, expect, it } from 'vitest';
import { canEditBoard, canSeeCase } from '@/lib/cases/visibility';

const player = { id: 'u_player', isKeeper: false };
const other = { id: 'u_other', isKeeper: false };
const keeper = { id: 'u_keeper', isKeeper: true };

describe('canSeeCase', () => {
  it('shows an open case to everyone', () => {
    expect(canSeeCase({ visibility: 'all' }, player)).toBe(true);
    expect(canSeeCase({ visibility: 'all' }, null)).toBe(true);
  });

  it('shows an assigned case only to its members and Keepers', () => {
    const members = new Set(['u_player']);
    expect(canSeeCase({ visibility: 'assigned' }, player, members)).toBe(true);
    expect(canSeeCase({ visibility: 'assigned' }, other, members)).toBe(false);
    expect(canSeeCase({ visibility: 'assigned' }, keeper, members)).toBe(true);
    expect(canSeeCase({ visibility: 'assigned' }, null, members)).toBe(false);
  });

  it('an assigned case with nobody on it is Keepers-only', () => {
    expect(canSeeCase({ visibility: 'assigned' }, player, new Set())).toBe(false);
    expect(canSeeCase({ visibility: 'assigned' }, keeper, new Set())).toBe(true);
  });

  it('hides a deleted case from players', () => {
    expect(canSeeCase({ visibility: 'all', deletedAt: 1700000000 }, player)).toBe(false);
    expect(canSeeCase({ visibility: 'all', deletedAt: 1700000000 }, keeper)).toBe(true);
  });
});

describe('canEditBoard', () => {
  it('lets any signed-in player work on a standalone board', () => {
    expect(canEditBoard({ caseId: null }, player, false)).toBe(true);
    expect(canEditBoard({ caseId: null }, null, false)).toBe(false);
  });

  it('makes a case board follow its case', () => {
    expect(canEditBoard({ caseId: 'c1' }, player, true)).toBe(true);
    expect(canEditBoard({ caseId: 'c1' }, player, false)).toBe(false);
  });
});
