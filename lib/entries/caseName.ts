/**
 * §24: how a dossier-bound artikel is called out in the archive.
 *
 * A voorwerp or a clue is made inside one investigation, and two of them called
 * "de brief" in two different dossiers are two different letters. So wherever
 * the archive *lists* one — the wiki, search, the autocomplete — it prints the
 * dossier in front of the name.
 *
 * Only in the printing. The stored name stays "De brief": rename the dossier
 * and every list follows, and the name in a search box is still short enough to
 * type. And the dossier is only named to someone who may open it — the caller
 * resolves it behind `visibleCaseCondition` and passes null otherwise, so a
 * confidential investigation is not given away by the label on one of its
 * clues.
 *
 * Pure and dependency-free, because both the server and the browser print it.
 *
 * §49: *which* artikelen get the prefix is no longer this file's question, and
 * no longer the soort's. It is `entries.case_prefix`, one tickbox per artikel,
 * and it is asked in exactly one place — `nameTheirCases` only fills in
 * `originCaseName` for an artikel that wears it. Everything downstream prints
 * what it was given, which is why this function did not have to change: an
 * artikel with the tickbox off arrives here with no dossier name at all, the
 * same way one whose dossier this reader may not open does.
 */
export function entryDisplayName(
  name: string,
  originCaseName?: string | null,
): string {
  const dossier = originCaseName?.trim();
  return dossier ? `${dossier}: ${name}` : name;
}

/** True when the name above is going to differ from the plain one. */
export function hasCasePrefix(originCaseName?: string | null): boolean {
  return Boolean(originCaseName?.trim());
}

/**
 * §24: is this one adrift — a soort that only exists inside a dossier, in no
 * dossier at all?
 *
 * It happens: the last dossier holding a clue is emptied, or a dossier goes in
 * the bin. `entryDisplayName` then prints the plain name, which is right and is
 * also silent about it, so the archive says so out loud with a small grey chip
 * beside the name wherever it *lists* one — and Beheer keeps the list of them,
 * so they can be filed again rather than quietly lost.
 *
 * Asked of the id, never of the name: a reader who may not open the dossier is
 * given no name (§1) and that is not the same fact at all.
 *
 * §49: what makes the question meaningful is the artikel's own `casePrefix` —
 * it has been told to wear a dossier's name and has no dossier to wear. The
 * soort's `case_only` used to answer this and no longer does: a persoon filed
 * nowhere is just a persoon, and so is a clue whose tickbox is off.
 */
export function isAdrift(entry: {
  casePrefix?: boolean | null;
  originCaseId?: string | null;
}): boolean {
  return Boolean(entry.casePrefix) && !entry.originCaseId;
}
