import { describe, expect, it } from 'vitest';
import { canSeeCase } from '@/lib/cases/visibility';

const keeper = { id: 'k', isKeeper: true };
const owner = { id: 'p1', isKeeper: false };
const chosen = { id: 'p2', isKeeper: false };
const other = { id: 'p3', isKeeper: false };

const grantFor = (id: string) => ({ userId: id, canView: true, canEdit: false });

/**
 * §7 under §17: "assigned investigators" became the chosen people on the
 * owner's view dial. The rule is the shared one in lib/access.ts; this pins the
 * case-shaped edge — a deleted case is a Keeper's alone.
 */
describe('canSeeCase', () => {
  it('everyone sees an open case, signed out included', () => {
    const open = { createdBy: 'p1', viewMode: 'all' as const, editMode: 'all' as const };
    expect(canSeeCase(open, other)).toBe(true);
    expect(canSeeCase(open, null)).toBe(true);
  });

  it('a confidential case is for the owner, the chosen, and the Keepers', () => {
    const confidential = { createdBy: 'p1', viewMode: 'some' as const, editMode: 'some' as const };
    expect(canSeeCase(confidential, owner)).toBe(true);
    expect(canSeeCase(confidential, chosen, grantFor('p2'))).toBe(true);
    expect(canSeeCase(confidential, other, null)).toBe(false);
    expect(canSeeCase(confidential, keeper)).toBe(true);
    expect(canSeeCase(confidential, null)).toBe(false);
  });

  it('a private case is the owner and the Keepers, and a grant changes nothing', () => {
    const priv = { createdBy: 'p1', viewMode: 'private' as const, editMode: 'private' as const };
    expect(canSeeCase(priv, owner)).toBe(true);
    expect(canSeeCase(priv, chosen, grantFor('p2'))).toBe(false);
    expect(canSeeCase(priv, keeper)).toBe(true);
  });

  it('a deleted case is only a Keeper\'s', () => {
    const gone = { createdBy: 'p1', viewMode: 'all' as const, editMode: 'all' as const, deletedAt: 1 };
    expect(canSeeCase(gone, owner)).toBe(false);
    expect(canSeeCase(gone, keeper)).toBe(true);
  });
});
