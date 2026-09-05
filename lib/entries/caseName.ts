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
