'use client';

import { useCallback } from 'react';
import { useUi } from '@/components/ui/UiProvider';
import type { SuggestionEntry } from './entrySuggestion';

/**
 * "'Jan' aanmaken" from inside a text: opens the New entry sheet and resolves
 * with what it made, or null when the sheet is closed without making anything.
 *
 * §95: shared by the rich text (`RichEditor`) and the short boxes
 * (`ShortEditor`), which offer the same row in the same list. It used to live
 * inside `RichEditor`.
 */
export function useRequestCreate() {
  const ui = useUi();
  const here = ui.caseHere;
  return useCallback(
    (name: string) =>
      new Promise<SuggestionEntry | null>((resolve) => {
        let settled = false;
        ui.openNewEntry({
          name,
          caseId: here?.id,
          // §49: made from the dossier's own writing is made *in* the dossier,
          // and therefore filed in it — the sheet has no question about that
          // left to ask. What it does ask is whether the dossier's name goes in
          // front of the new artikel's.
          onCreated: (entry) => {
            settled = true;
            resolve({
              id: entry.id,
              slug: entry.slug,
              name: entry.name,
              shortDescription: entry.shortDescription,
              typeSlug: entry.typeSlug,
              typeLabel: entry.typeLabel,
              typeIcon: entry.typeIcon,
              typeColour: entry.typeColour,
              // §48: whether the sheet already put it in the dossier, so the
              // question is not asked a second time.
              filed: entry.filed,
            });
          },
        });
        // If the sheet is dismissed the promise would hang; give it a bounded
        // life so the editor never ends up waiting forever.
        const check = setInterval(() => {
          if (settled) {
            clearInterval(check);
            return;
          }
          if (!document.querySelector('.sheet-backdrop')) {
            clearInterval(check);
            resolve(null);
          }
        }, 400);
      }),
    [ui, here],
  );
}
