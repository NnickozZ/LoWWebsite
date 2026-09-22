'use client';

import type { useUi } from '@/components/ui/UiProvider';
import { BUY_UNDO_MS } from '@/lib/kamers/undo';
import { fill, type Words } from '@/lib/words';
import { munt } from './plekWords';
import { kamerPostFor } from './post';

type Router = { refresh: () => void };

/**
 * §93: de melding na een koop — één plek, voor de winkel én de catalogus in de
 * plek-kiezer, zodat *Ongedaan maken* op allebei hetzelfde doet.
 *
 * Nick, ronde 54: een correctie, geen terugverkoop. De knop staat tien seconden
 * in de melding (`BUY_UNDO_MS`, het venster van `undoPurchase`); wat hij doet
 * beslist de server, en een weigering (te laat, al teruggebracht) komt terug als
 * de zin die de server schreef.
 */
export function buyToast(
  ui: Pick<ReturnType<typeof useUi>, 'toast'>,
  router: Router,
  {
    message,
    roomId,
    entryId,
    show,
    words,
  }: {
    message: string;
    roomId: string;
    entryId: string;
    /** *Bekijk*, waar de pagina een deur naar de tegel kent. */
    show?: { label: string; onAction: () => void };
    words: Words;
  },
) {
  const undo = async () => {
    const { error, data } = await kamerPostFor<{ returned: number; name: string }>(
      `/api/kamers/${roomId}/terug`,
      { entryId },
    );
    if (error || !data) {
      if (error) ui.toast(error);
      return;
    }
    ui.toast(fill(words.buyReturned, { ding: data.name, bedrag: munt(data.returned, words) }));
    router.refresh();
  };
  const undoAction = { label: words.buyUndo, onAction: () => void undo() };
  // Zonder deur is *Ongedaan maken* de eerste knop; met deur staat hij ernaast.
  if (show) ui.toast(message, show, { ms: BUY_UNDO_MS, also: undoAction });
  else ui.toast(message, undoAction, { ms: BUY_UNDO_MS });
}
