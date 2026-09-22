'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fill, type Words } from '@/lib/words';
import { MEANING, plekWord, withPrice } from './plekWords';
import { kamerPost } from './post';
import type { PlekKind } from '@/lib/kamers/shape';

/**
 * §79: the button that opens a plek.
 *
 * It is offered only to a hand that may arrange this kamer, and it is *held*
 * when the balance is under the price — the price is on the tile either way,
 * because a kamer has to show you what you could have or there is nothing to
 * save up for. A held button says why rather than vanishing: a control that
 * disappears when you are two munten short teaches nothing.
 *
 * **§84 veranderde twee dingen aan die laatste zin.**
 *
 * Hij stond in een `title`, en een `title` bestaat niet op een telefoon. Het is
 * de zin die iemand aan het sparen zet — precies de verkeerde om te
 * verstoppen — dus hij staat nu gewoon op de tegel, en de knop is weg in plaats
 * van uitgeschakeld: een knop die niets doet naast een zin die zegt waarom, is
 * één ding te veel.
 *
 * En de knop zegt wat hij kost. Openen is onomkeerbaar en vraagt niets — met
 * opzet, want een dialoog is frictie op iets wat je twintig keer per avond
 * doet — dus het bedrag hoort op de knop zelf te staan. Dat is dezelfde
 * bescherming zonder de klik.
 *
 * `unlockSlot` charges inside the UPDATE, so a second click during the round
 * trip cannot buy the plek twice. `busy` is a courtesy on top of that, not the
 * guard.
 */
export function UnlockButton({
  roomId,
  slotId,
  kind,
  price,
  guestOf = null,
  label,
  words,
}: {
  roomId: string;
  slotId: string;
  kind: PlekKind;
  price: number;
  /** §90: de onderzoeker, als dit niet je eigen kamer is — dan is het niet "je" plank. */
  guestOf?: string | null;
  /**
   * §93 (E5): een eigen woord voor de knop — in de winkel zegt hij welke plek
   * hij opent (*Kist openen · 5 munten*), want daar staat hij niet op de tegel.
   */
  label?: string;
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/unlock`);
      if (error) {
        ui.toast(error);
        return;
      }
      /*
       * §84: en zeggen wat er gebeurd is. Zonder dit was de enige terugkoppeling
       * één cijfer dat veranderde in een blokje dat eruitzag als een prijskaartje
       * — de doorloop mat 174 ms tussen klik en nieuw saldo, en niemand zag het.
       * De beurs in de hoek telt ondertussen zichtbaar af.
       */
      ui.toast(
        guestOf
          ? fill(words.unlockedThere, { plek: plekWord(kind, words), naam: guestOf })
          : fill(words.unlockedHere, { plek: plekWord(kind, words) }),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-small plek-action"
      data-testid="plek-unlock"
      disabled={busy}
      onClick={() => void unlock()}
    >
      <Icon name={MEANING.openen} size={13} />
      {withPrice(label ?? words.slotOpen, price, words)}
    </button>
  );
}
