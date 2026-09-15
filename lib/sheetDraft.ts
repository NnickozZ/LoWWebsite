/**
 * §69 (4.5) — wat je typte blijft staan als het blad dichtvalt.
 *
 * Escape closes a sheet, and until this round that threw away everything typed
 * into it. The nieuw-artikel blad is the one that hurt: it has a name, a
 * description with an `@`-list in it, a soort and two tickboxes, and the
 * commonest reason to press Escape in it is to get rid of the suggestion list
 * — which §69's popover stack now handles, but the older reflex is to press it
 * twice. The second press cost the whole form.
 *
 * A draft lives here rather than in `UiProvider` for the same reason the sheet
 * pile and the popover pile do: the honest lifetime of a half-typed form is
 * *the page*, not a component that mounts and unmounts every time the sheet
 * opens — which is exactly the thing that was losing it. It is deliberately
 * not `sessionStorage`: a draft that outlives a reload would come back in a
 * new archive, on the other side of the Keeperkant, or after the artikel was
 * already made somewhere else, and be wrong in a way nobody asked for.
 *
 * Rules that are easy to get wrong and are therefore tested:
 *
 *  - **A prefill beats a draft, and clears it.** When something opens the blad
 *    *with* a name in hand ("'Jan' aanmaken" from a mention, a speld becoming
 *    an artikel), that is a new subject, not a continuation. Coming back to a
 *    half-typed draft under somebody else's name is worse than an empty form.
 *  - **Making the thing clears it.** Otherwise the next `+` is pre-filled with
 *    the artikel you just made.
 *  - **Empty is absent.** A draft of nothing but empty strings is dropped, so
 *    "did I leave something here" has one answer.
 */

export type Draft = Record<string, string>;

/** Per-page, per-sheet. The keys are the two sheets that carry a form worth keeping. */
const drafts = new Map<string, Draft>();

/** What was left in this sheet, or an empty draft. Never null: a caller reads fields off it. */
export function readDraft(key: string): Draft {
  return drafts.get(key) ?? {};
}

/**
 * Remember what is in the boxes now. Fields that are empty (or whitespace) are
 * dropped, and a draft with nothing left in it is forgotten entirely.
 */
export function writeDraft(key: string, patch: Draft): void {
  const kept: Draft = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value.trim() !== '') kept[field] = value;
  }
  if (Object.keys(kept).length === 0) drafts.delete(key);
  else drafts.set(key, kept);
}

/** The thing was made, or a prefill took over. Either way this draft is done. */
export function clearDraft(key: string): void {
  drafts.delete(key);
}

/** Tests only — the map is module state and would otherwise leak between them. */
export function resetDrafts(): void {
  drafts.clear();
}

/** The two sheets that keep one. Named so a third has to think about it. */
export const DRAFT_ENTRY = 'new-entry';
export const DRAFT_CASE = 'new-case';
