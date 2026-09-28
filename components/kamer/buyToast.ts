'use client';

import type { useUi } from '@/components/ui/UiProvider';
import { BUY_UNDO_MS } from '@/lib/kamers/undo';
import { fill, type Words } from '@/lib/words';
import { munt } from './plekWords';
import { kamerPostFor } from './post';
import { announceBalance } from './saldo';

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
  /*
   * §103 golf H (T15): één onderwerp, één melding. De koop, het terugbrengen
   * en wat er daarna met het ding gebeurt (verplaatsen, weghalen) dragen
   * dezelfde sleutel, dus *Leesstoel teruggebracht* vervangt *Leesstoel ligt
   * nu op je bureau* in plaats van eronder te komen.
   */
  const key = toastKeyOf(entryId);
  const undo = async () => {
    const { error, data } = await kamerPostFor<{ returned: number; name: string; balance?: number }>(
      `/api/kamers/${roomId}/terug`,
      { entryId },
      words,
    );
    if (error || !data) {
      if (error) ui.toast(error);
      return;
    }
    // §103 golf H (T8): het getal rolt terug in hetzelfde moment als de melding.
    announceBalance(roomId, data.balance);
    ui.toast(fill(words.buyReturned, { ding: data.name, bedrag: munt(data.returned, words) }), undefined, { key });
    router.refresh();
  };
  const undoAction = { label: words.buyUndo, onAction: () => void undo() };
  // Zonder deur is *Ongedaan maken* de eerste knop; met deur staat hij ernaast.
  if (show) ui.toast(message, show, { ms: BUY_UNDO_MS, also: undoAction, key });
  else ui.toast(message, undoAction, { ms: BUY_UNDO_MS, key });
}

/** §103 golf H (T15): de sleutel van een melding over één ding in een kamer. */
export function toastKeyOf(entryId: string): string {
  return `ding:${entryId}`;
}
