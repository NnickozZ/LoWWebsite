import { describe, expect, it } from 'vitest';
import { canEdit, canManageAccess, canView, isAccessMode } from '@/lib/access';

/**
 * §17. Three rules and the shape of the dials; everything else in lib/access.ts
 * is database plumbing that the e2e suite exercises through real screens.
 */
const keeper = { id: 'k', isKeeper: true };
const owner = { id: 'o', isKeeper: false };
const chosen = { id: 'c', isKeeper: false };
const stranger = { id: 's', isKeeper: false };

const row = (viewMode: 'all' | 'some' | 'private', editMode: 'all' | 'some' | 'private', locked = false) => ({
  createdBy: 'o',
  viewMode,
  editMode,
  accessLocked: locked,
});
const grant = (canViewIt: boolean, canEditIt: boolean) => ({ userId: 'c', canView: canViewIt, canEdit: canEditIt });

describe('canView', () => {
  it("'all' is everyone, even signed out", () => {
    expect(canView(row('all', 'all'), stranger)).toBe(true);
    expect(canView(row('all', 'all'), null)).toBe(true);
  });
  it("'some' is the chosen, the owner, and the Keepers", () => {
    expect(canView(row('some', 'all'), chosen, grant(true, false))).toBe(true);
    expect(canView(row('some', 'all'), chosen, grant(false, false))).toBe(false);
    expect(canView(row('some', 'all'), stranger, null)).toBe(false);
    expect(canView(row('some', 'all'), owner)).toBe(true);
    expect(canView(row('some', 'all'), keeper)).toBe(true);
  });
  it("'private' is the owner and the Keepers, grants notwithstanding", () => {
    expect(canView(row('private', 'all'), chosen, grant(true, true))).toBe(false);
    expect(canView(row('private', 'all'), owner)).toBe(true);
    expect(canView(row('private', 'all'), keeper)).toBe(true);
  });
});

describe('canEdit', () => {
  it('editing implies viewing: an edit grant on something you cannot see is nothing', () => {
    expect(canEdit(row('private', 'all'), chosen, grant(true, true))).toBe(false);
    expect(canEdit(row('some', 'all'), stranger, null)).toBe(false);
  });
  it("'all' lets anyone who can see it edit it", () => {
    expect(canEdit(row('all', 'all'), stranger)).toBe(true);
    expect(canEdit(row('some', 'all'), chosen, grant(true, false))).toBe(true);
  });
  it("'some' is the edit list", () => {
    expect(canEdit(row('all', 'some'), chosen, grant(true, true))).toBe(true);
    expect(canEdit(row('all', 'some'), chosen, grant(true, false))).toBe(false);
    expect(canEdit(row('all', 'some'), stranger, null)).toBe(false);
  });
  it("'private' is the owner and the Keepers", () => {
    expect(canEdit(row('all', 'private'), chosen, grant(true, true))).toBe(false);
    expect(canEdit(row('all', 'private'), owner)).toBe(true);
    expect(canEdit(row('all', 'private'), keeper)).toBe(true);
  });
  it('nobody signed out edits anything', () => {
    expect(canEdit(row('all', 'all'), null)).toBe(false);
  });
});

describe('canManageAccess', () => {
  it('the owner turns the dials, unless the Keeper bolted them', () => {
    expect(canManageAccess(row('all', 'all'), owner)).toBe(true);
    expect(canManageAccess(row('all', 'all', true), owner)).toBe(false);
  });
  it('a Keeper always may; nobody else ever', () => {
    expect(canManageAccess(row('all', 'all', true), keeper)).toBe(true);
    expect(canManageAccess(row('all', 'all'), chosen)).toBe(false);
    expect(canManageAccess(row('all', 'all'), null)).toBe(false);
  });
});

describe('isAccessMode', () => {
  it('accepts the three and nothing else', () => {
    expect(isAccessMode('all')).toBe(true);
    expect(isAccessMode('some')).toBe(true);
    expect(isAccessMode('private')).toBe(true);
    expect(isAccessMode('keeper')).toBe(false);
    expect(isAccessMode(undefined)).toBe(false);
  });
});
