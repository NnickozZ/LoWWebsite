'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * §31: the dossiers whose contents a reference box should offer first.
 *
 * When you are writing an artikel that lives in an investigation, the thing you
 * are about to name is nearly always something already in that investigation —
 * the person you interviewed, the letter you found, the house you went to. So
 * every dropdown that picks an artikel (`EntryPicker`, the `entry_link` and
 * `entry_links` fields, and the editor's `@` / `[[` list) puts those on top.
 *
 * **A ranking, never a filter.** The whole archive is still in the list and in
 * the same order underneath; rule 1 is untouched, because the boost is an
 * `ORDER BY` over rows that were already behind `visibleEntryCondition`, and
 * the server puts the ids through `visibleCaseCondition` before it looks
 * anything up in them. A boosted row is marked with a folder icon and nothing
 * else — never the dossier's name, which is not this list's to print.
 *
 * **A context rather than a prop.** The artikel page hands its dossiers to
 * `EntryView`, which is a large component with the pickers three and four
 * levels beneath it, and the editor's autocomplete is further down still,
 * inside a ProseMirror plugin. Threading one string through all of that would
 * touch a dozen components that have no business knowing about dossiers.
 * Custom context is what this is for: the two pages that know set it, the four
 * boxes that care read it, and nothing in between changes.
 *
 * **A list, not one id.** An artikel can be in several dossiers at once and the
 * artikel page already knows all of them; picking one would be a guess, and the
 * guess would be wrong exactly when a clue belongs to two investigations.
 */
const EMPTY: string[] = [];

const PreferredCasesContext = createContext<string[]>(EMPTY);

export function PreferredCases({ ids, children }: { ids: string[]; children: ReactNode }) {
  // A fresh array every render would re-run every consumer's fetch effect on
  // every keystroke, so the identity follows the ids themselves.
  const key = ids.join(',');
  const value = useMemo(() => (key ? key.split(',') : EMPTY), [key]);
  return <PreferredCasesContext.Provider value={value}>{children}</PreferredCasesContext.Provider>;
}

/** The dossiers to rank first, or an empty list outside one. */
export function usePreferredCases(): string[] {
  return useContext(PreferredCasesContext);
}

/** The `/api/suggest` query fragment for those dossiers — '' when there are none. */
export function preferredCasesParam(ids: readonly string[]): string {
  return ids.length ? `&cases=${ids.map(encodeURIComponent).join(',')}` : '';
}
