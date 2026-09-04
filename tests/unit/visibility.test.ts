import { describe, expect, it } from 'vitest';
import { canSeeEntry, canSeeSection } from '@/lib/entries/visibility';

const player = { id: 'u_player', isKeeper: false };
const keeper = { id: 'u_keeper', isKeeper: true };

describe('canSeeEntry', () => {
  it('shows public entries to everyone', () => {
    expect(canSeeEntry({ visibility: 'all' }, player)).toBe(true);
    expect(canSeeEntry({ visibility: 'all' }, null)).toBe(true);
  });

  it('never shows keeper-only entries to a player', () => {
    expect(canSeeEntry({ visibility: 'keeper' }, player)).toBe(false);
    expect(canSeeEntry({ visibility: 'keeper' }, null)).toBe(false);
    expect(canSeeEntry({ visibility: 'keeper' }, keeper)).toBe(true);
  });

  it('shows a revealed entry only to the players it was revealed to', () => {
    const revealed = new Set(['e_1']);
    expect(canSeeEntry({ visibility: 'players' }, player, revealed, 'e_1')).toBe(true);
    expect(canSeeEntry({ visibility: 'players' }, player, revealed, 'e_2')).toBe(false);
    expect(canSeeEntry({ visibility: 'players' }, null, revealed, 'e_1')).toBe(false);
  });

  it('hides deleted entries from players and keeps them for Keepers', () => {
    expect(canSeeEntry({ visibility: 'all', deletedAt: 1700000000 }, player)).toBe(false);
    expect(canSeeEntry({ visibility: 'all', deletedAt: 1700000000 }, keeper)).toBe(true);
  });
});

describe('canSeeSection', () => {
  it('follows the same rule as entries', () => {
    expect(canSeeSection({ visibility: 'keeper' }, player)).toBe(false);
    expect(canSeeSection({ visibility: 'keeper' }, keeper)).toBe(true);
    expect(canSeeSection({ visibility: 'all' }, player)).toBe(true);
    expect(canSeeSection({ visibility: 'players' }, player, new Set(['s_1']), 's_1')).toBe(true);
    expect(canSeeSection({ visibility: 'players' }, player, new Set(), 's_1')).toBe(false);
  });
});
