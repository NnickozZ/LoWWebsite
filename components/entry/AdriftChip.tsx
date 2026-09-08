'use client';

import { useUi } from '@/components/ui/UiProvider';

/**
 * §24: "Zonder dossier".
 *
 * §49: an artikel whose own tickbox says it wears a dossier's name (it used to
 * be its soort that said so) and that has ended up in no dossier at all prints
 * its plain
 * name — `entryDisplayName` already does that when there is no origin — and the
 * plain name is *silent* about it: a clue called "De brief" reads exactly like a
 * clue that never needed a dossier. So the archive says so, once, in grey,
 * wherever it lists one, and Beheer keeps the list so they can be filed again.
 *
 * A client component on purpose, even though most of its callers are server
 * ones: it is the word "Zonder dossier" that has to come out of the Keeper's
 * word list (rule 8), and `useUi().words` is where a component reads that
 * without every list page having to pass it down.
 *
 * The predicate is `isAdrift` in `lib/entries/caseName.ts` — one place asks the
 * question, four places draw the answer.
 */
export function AdriftChip() {
  const words = useUi().words;
  return (
    <span className="chip chip-muted" title="Dit artikel zit in geen enkel dossier.">
      {words.noCase}
    </span>
  );
}
