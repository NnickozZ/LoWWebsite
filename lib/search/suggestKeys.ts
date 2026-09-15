/**
 * §69 (5.2) — de toetsen van een suggestielijst, zonder DOM.
 *
 * The `@`-list has walked with the arrows and picked with Enter since round 18.
 * The five *pickers* never learned: `EntryPicker`, `CasePicker`,
 * `FamilyTreePicker`, the floating `BoardPicker` and the stamboom's kiezer all
 * drew the same `.suggest-item` rows and answered no key at all, so the only
 * way to take the thing you had just typed the name of was to let go of the
 * keyboard and aim at it. On a list whose **first** row is "'X' aanmaken"
 * (§6's trap) that is not merely slower — the row a hurried hand lands on is
 * the one that makes a second artikel.
 *
 * The arithmetic is here so it can be asked questions; `components/ui/
 * useSuggestKeys.ts` is the half that touches elements.
 */

/** What a keystroke means to a list. `none` means "not ours — leave it alone". */
export type SuggestKey = 'down' | 'up' | 'enter' | 'none';

/** Anything a React or DOM keyboard event can answer. */
export type KeyLike = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  /** True midway through an IME composition, where Enter commits the candidate, not the row. */
  isComposing?: boolean;
};

/**
 * Read a keystroke.
 *
 * A modifier means the key is somebody else's: `Ctrl+Enter` submits forms in
 * several places, `Alt+↓` opens a browser's own autocomplete, and `Cmd+↑` is
 * "top of the document" on a Mac. And an Enter during an IME composition is
 * choosing a Japanese candidate, not a row — the same guard `MentionPopover`
 * has carried since round 18.
 */
export function suggestKey(event: KeyLike): SuggestKey {
  if (event.isComposing) return 'none';
  if (event.altKey || event.ctrlKey || event.metaKey) return 'none';
  if (event.key === 'ArrowDown') return 'down';
  if (event.key === 'ArrowUp') return 'up';
  // Shift+Enter is a newline in a textarea, and two of the five boxes are one.
  if (event.key === 'Enter' && !event.shiftKey) return 'enter';
  return 'none';
}

/**
 * Where the highlight goes next.
 *
 * It wraps, because a list of six is short enough that walking off the bottom
 * and arriving at the top is quicker than turning round — which is what the
 * `@`-list does, and this is the same list to a reader.
 *
 * A **negative** `current` means "nothing is highlighted yet", which is where
 * every list starts — and from there the first ↓ lands on the *first* row, not
 * the second. (The `@`-list differs because it highlights its first row the
 * moment it opens; these lists do not, on purpose: a highlight before anybody
 * has asked for one reads as a choice already made.) Anything else is clamped:
 * rows arrive after a fetch and go away when the query changes, so the index
 * this is asked about is routinely one that no longer exists.
 */
export function nextIndex(current: number, total: number, key: 'down' | 'up'): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(current) || current < 0) return key === 'down' ? 0 : total - 1;
  const from = Math.min(Math.trunc(current), total - 1);
  return key === 'down' ? (from + 1) % total : (from - 1 + total) % total;
}

/**
 * Which row Enter takes.
 *
 * Deliberately **the first row when nothing is highlighted yet**, rather than
 * nothing at all: somebody who types a name and presses Enter means the thing
 * at the top of the list, and making them press ↓ first to say so is the kind
 * of ceremony this item exists to remove. `null` only when there is no list.
 */
export function rowForEnter(current: number, total: number): number | null {
  if (total <= 0) return null;
  if (!Number.isFinite(current) || current < 0) return 0;
  return Math.min(Math.trunc(current), total - 1);
}
