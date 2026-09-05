'use client';

import type { ConfirmOptions } from '@/components/ui/UiProvider';
import type { Words } from '@/lib/words';

/**
 * "It is on the wall — should it be in the file too?"
 *
 * A board hanging off a case is that case's wall, and pinning someone to it
 * almost always means they belong in the file as well. Almost always, not
 * always: a suspect can go up on the cork for an evening without being filed.
 * So the archive asks.
 *
 * The question lives here rather than inside the board because a card reaches
 * a wall from more than one place — the board's own search box, the sheet that
 * makes a new artikel, and *&lsquo;Op het prikbord&rsquo; from the artikel page
 * itself, which is the one that used to file nothing and say nothing. Wherever
 * the card comes from, the same sheet asks the same question in the same words.
 */

/** The parts of `useUi()` this needs — passed in, so this stays a plain module. */
export type FilingUi = {
  words: Words;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toast: (message: string, action?: { label: string; onAction: () => void }) => void;
};

export type FilingOffer = {
  caseId: string;
  /** The case's name, when the caller knows it; a generic phrase when not. */
  caseName: string | null;
  entryId: string;
  entryName: string;
};

/**
 * Asks, and files if the answer is yes. Resolves true only when the entry is
 * now in the case, so the caller can remember not to ask about it again.
 *
 * A sheet, not a toast: this is the one question the wall has to ask, and a
 * line in the corner was too easy to miss.
 */
export async function offerToFileEntry(ui: FilingUi, offer: FilingOffer): Promise<boolean> {
  const words = ui.words;
  const dossier = offer.caseName ?? `dit ${words.case}`;

  const yes = await ui.confirm({
    title: `${offer.entryName} zit nog niet in ${dossier}`,
    message: (
      <>
        De {words.card} hangt nu op het {words.board}. Wil je {offer.entryName} ook bij de{' '}
        {words.entryPlural} van {dossier} zetten?
      </>
    ),
    confirmLabel: `Toevoegen aan ${words.case}`,
    cancelLabel: 'Alleen prikken',
  });
  if (!yes) return false;

  const response = await fetch(`/api/cases/${offer.caseId}/entries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entryId: offer.entryId }),
  }).catch(() => null);

  if (!response?.ok) {
    ui.toast('Opslaan is niet gelukt. Probeer het opnieuw.');
    return false;
  }

  ui.toast(`${offer.entryName} toegevoegd aan ${dossier}.`);
  return true;
}
