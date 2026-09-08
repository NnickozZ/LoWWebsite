'use client';

import { useCallback } from 'react';
import { offerToFileEntry } from '@/components/boards/offerToFile';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §48: a name typed into a dossier's own text, and the question that follows.
 *
 * Naming something in the werktheorie is not quite the same as filing it —
 * "we spoke to Jan about the lighthouse" mentions two things and files
 * neither — but nine times in ten it is what the writer meant, and until round
 * 25 there was no way to do it without scrolling back up to the add-box. So the
 * archive asks, once, in the same sheet the prikbord has asked with since §31.
 *
 * It asks about anything named in the dossier's *own* writing: the `@` in the
 * notities, in its samenvatting, in a plain box on that page. It does not ask
 * anywhere else — the hook answers with a no-op the moment `caseHere` is null,
 * which it is on every screen that is not a dossier.
 *
 * Three silences, all deliberate:
 *   - the artikel is already on a shelf of this dossier (`holds`);
 *   - this hand may not file anything here (`canEdit`, §17);
 *   - it has just been made *in* this dossier and was filed by the sheet that
 *     made it (the sheet says so with `filed`).
 *
 * §49: that third silence is now the whole of the "new artikel" case — a thing
 * made in a dossier is always filed there, so `filed` always comes back true
 * and there is nothing left to offer. The offer that remains is the one this
 * hook was written for: a name typed in a dossier's text that was *already* an
 * artikel somewhere else in the archive.
 */
export function useMentionFiling(): (entry: { id: string; name: string }, filed?: boolean) => void {
  const ui = useUi();
  const here = ui.caseHere;
  return useCallback(
    (entry, filed) => {
      if (!here || filed) return;
      if (!here.canEdit || here.holds(entry.id)) return;
      void offerToFileEntry(ui, {
        caseId: here.id,
        caseName: here.name,
        entryId: entry.id,
        entryName: entry.name,
        reason: 'text',
      }).then(() => {
        // Asked and answered: either way this artikel is not asked about again
        // while the page is open. A "no" that came back every time you typed
        // the same name would be the worse bug. `offerToFileEntry` has already
        // said so in a toast when the answer was yes.
        here.remember(entry.id);
      });
    },
    [here, ui],
  );
}
