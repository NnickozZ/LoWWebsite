/**
 * §18b: the browser's half of "who is writing?", as pure functions.
 *
 * The server side of the question lives in `lib/auth/author.ts` and never
 * believes a word of what arrives. This is the other end: what one *window*
 * remembers, and what the shell should therefore do about the person looking
 * at it. Three answers and no fourth:
 *
 *   `keeper`      a Keeper is asked nothing and may write anything — a Keeper
 *                 is always the Keeper, so there is no onderzoeker to choose;
 *   `no-author`   a speler with no onderzoeker at all. Nothing to ask, and the
 *                 archive will refuse every write, so the shell says so once,
 *                 plainly, and switches its inputs off;
 *   `ask`         a speler who holds onderzoekers and this window has not said
 *                 which. Asked at the first attempt to type, never on arrival;
 *   `ready`       this window has answered, and the answer still stands.
 *
 * Nothing here touches React, `sessionStorage` or `fetch` — the two decisions
 * that matter can be read off in one place and tested without a browser.
 */

/** Where a window keeps its answer. Per window, on purpose: `sessionStorage`. */
export const WRITING_AS_KEY = 'zcf:writing-as';

export type AuthorStance = 'keeper' | 'no-author' | 'ask' | 'ready';

/** The little of `Storage` this module needs — so a test may hand it a fake. */
export type MiniStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * A remembered answer is only worth something while the account still holds
 * that onderzoeker. One untied in another window (or by a Keeper) leaves a
 * stale id behind, and a stale id would travel on every request until the tab
 * was closed — the server resolves it to nobody and quietly falls back, which
 * is exactly the silent mis-filing this whole round exists to stop.
 */
export function readRememberedAuthor(
  raw: string | null | undefined,
  characterIds: readonly string[],
): string | null {
  const id = (raw ?? '').trim();
  if (!id) return null;
  return characterIds.includes(id) ? id : null;
}

/** The same, read out of a window's own store. A store that throws reads as empty. */
export function rememberedFrom(
  storage: MiniStorage | null | undefined,
  characterIds: readonly string[],
): string | null {
  if (!storage) return null;
  try {
    return readRememberedAuthor(storage.getItem(WRITING_AS_KEY), characterIds);
  } catch {
    // Private mode, or a browser that refuses storage: the window simply has
    // no memory and is asked again. Never a reason to fail.
    return null;
  }
}

/** Write the answer down, or rub it out with `null`. Failure is not fatal. */
export function writeRemembered(storage: MiniStorage | null | undefined, id: string | null): void {
  if (!storage) return;
  try {
    if (id) storage.setItem(WRITING_AS_KEY, id);
    else storage.removeItem(WRITING_AS_KEY);
  } catch {
    /* the window is simply asked again next time */
  }
}

/** Asked, banned, or left alone. */
export function authorStance(viewer: {
  isKeeper: boolean;
  characterIds: readonly string[];
  remembered?: string | null;
}): AuthorStance {
  if (viewer.isKeeper) return 'keeper';
  if (!viewer.characterIds.length) return 'no-author';
  return readRememberedAuthor(viewer.remembered, viewer.characterIds) ? 'ready' : 'ask';
}

/** May this person write at all? The read-only banner's question, inverted. */
export function mayTypeWith(stance: AuthorStance): boolean {
  return stance !== 'no-author';
}

/**
 * May this person make a *new* artikel? Everybody may, `no-author` included —
 * and that one is the whole reason this is a second question rather than the
 * one above.
 *
 * An onderzoeker is an artikel somebody tied to their account, so a speler
 * with none has exactly one thing left to do in the archive: make the artikel
 * that becomes their first. Switching that road off along with all the others
 * would leave them with a banner telling them to do something the screen will
 * not let them start. The archive agrees on the wire
 * (`requireAuthorOrFirstCharacter`); this is the same rule, on the button.
 *
 * Everything *after* that first artikel — typing in it, filing it, a dossier,
 * a prikbord — is still `mayTypeWith`.
 */
export function mayStartEntryWith(stance: AuthorStance): boolean {
  return stance === 'no-author' || mayTypeWith(stance);
}

/** Should the sheet open when this person first tries to type? */
export function shouldPrompt(stance: AuthorStance): boolean {
  return stance === 'ask';
}

/**
 * Whose name the archive will put on this window's next write.
 *
 * The window's own answer where there is one; otherwise the account's
 * `active_character_id`, because that is what a request with no `X-Character`
 * header falls back to — and a full page navigation is exactly such a request.
 * The indicator prints this rather than the answer alone, so it never claims a
 * name the server would not use.
 */
export function effectiveAuthorId(input: {
  isKeeper: boolean;
  chosen: string | null;
  activeId: string | null;
}): string | null {
  if (input.isKeeper) return null;
  return input.chosen ?? input.activeId ?? null;
}
