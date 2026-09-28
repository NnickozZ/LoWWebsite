'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { MEANING, munt, plekWord, withPrice } from '@/components/kamer/plekWords';
import { kamerPostFor } from '@/components/kamer/post';
import { buyToast } from '@/components/kamer/buyToast';
import { holdBeforeRefresh, markLanding, reducedMotion, tokenMs } from '@/components/kamer/moment';
import { useUi } from '@/components/ui/UiProvider';
import { releaseRefreshHold, takeRefreshHold } from '@/components/live/refreshHold';
import type { PlekKind } from '@/lib/kamers/shape';
import { play } from '@/lib/sound/klank';
import { fill, type Words } from '@/lib/words';
import { announceBalance } from '@/components/kamer/saldo';

/**
 * §82: kopen vanuit de winkel.
 *
 * Deliberately the same three lines as the catalogue tab in
 * `components/kamer/PlaceButton.tsx`: one POST to the plek's own `buy` route,
 * the sentence that comes back shown as it is written, and a
 * `router.refresh()` when it worked. There is no second road to a purchase and
 * this file is not one — `buyFurnishing` asks all five of its questions again
 * however the button was pressed, so a shop that has gone stale (somebody else
 * took the last lantaarn, the munten were spent on another tab) refuses here
 * exactly as it would in the kamer.
 *
 * `slotId` is `shopFor`'s `landsIn` for the kind this row is buying into: the
 * first open, empty plek of that kind. It is a convenience and never a
 * decision — the route still checks that the plek is open, empty and of the
 * right kind, so a `landsIn` that went out of date between the render and the
 * click comes back as a refusal and not as a thing in the wrong drawer.
 *
 * **§84 gave the purchase a voice.** Before it, this was the quietest spend in
 * the archive: one click, two munten gone, and the only sign was a single digit
 * changing in a blokje that looked exactly like a price tag. The doorloop
 * measured 174 ms between click and new balance — the speed was never the
 * problem, the silence was. So the button says what it costs *before*, and a
 * toast says where the thing went *after*, with a door to go and look at it.
 * There is still no confirmation dialog, on purpose: this is something you do
 * twenty times in an evening and a dialog would be friction, not care.
 *
 * **§103 (K2) gave it a moment.** Within 100 ms of the click the button says
 * *Gekocht*, with a stamp that comes down (`scale 1.15 → 1`, −4°, 240 ms). That
 * is optimistic **only in the drawing**: nothing about the saldo, the row or
 * the kamer is guessed, and the truth stays the server's. A refusal puts the
 * button back and shows the sentence the server wrote. Then the new row, and
 * the note for the kamer (`markLanding`) so the thing lands on its tile once.
 *
 * **§103 (K6) made it one line**: *Kopen · 2 → bureau*. The coin in front says
 * munten; the name of the onderzoeker is in the kiezer above, and comes onto
 * the button only when that kiezer is out of view (`useKiezerInBeeld`). The
 * whole sentence — *Kopen voor Bertus · 2 munten → bureau* — is the button's
 * accessible name all the time, so §90's information never left.
 *
 * **§103 herstel (#18): the price once per row.** The stamp above the button
 * *is* the price (`.winkel-prijs`), so the button says only what it does and
 * where it goes: *Kopen → bureau*. The accessible name is still the whole
 * sentence with the price in it (§90), because a screen reader does not see
 * the stamp and the button.
 *
 * **§103 herstel (#6): the stamp is seen.** It was red on red for the first
 * ~70 ms (the `.btn` background faded out under it) and stood for ~150 ms
 * before the row changed. Now the background goes at once (`transition: none`
 * in `kamer.css`), and `router.refresh()` waits until the stamp has landed and
 * lain for a `--dur-5` (`holdBeforeRefresh`). The server has already answered;
 * only the drawing waits.
 */
export function BuyButton({
  roomId,
  slotId,
  entryId,
  name,
  kind,
  price,
  roomSlug,
  buyerName = null,
  words,
}: {
  roomId: string;
  /** Where it would land — `shopFor`'s `landsIn` for this row's kind. */
  slotId: string;
  entryId: string;
  /** What it is called, for the sentence afterwards. */
  name: string;
  /** Which kind of plek it lands on, for that same sentence. */
  kind: PlekKind;
  price: number;
  /** The kamer to go and look at it in, or null when this is not a page that knows. */
  roomSlug: string | null;
  /**
   * §90 (E2): voor wie je koopt, als je meer dan één onderzoeker draagt —
   * "Kopen voor Bertus · 1 munt". Het stond alleen in de eyebrow, in 11 px
   * kapitalen, en een koop gaat niet terug.
   */
  buyerName?: string | null;
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  /** §103 (K2): `bought` is de tekening na de klik, niet de waarheid. */
  const [bought, setBought] = useState(false);
  const busy = useRef(false);
  const reset = useRef<number | null>(null);
  /*
   * §103 herstel (#6): de koop houdt de live-verversing vast (§59) zolang de
   * stempel ligt. Zonder dit kwam de nieuwe rij toch na ±150 ms, want de koop
   * laat `room:{id}` bewegen en `LivePage` en de beurs in de schil verversen
   * daarop — de vertraagde `router.refresh()` hieronder hield alleen zichzelf
   * tegen. Een hold laat geen signaal vallen: bij het loslaten volgt één
   * verversing.
   */
  const holdId = useId();
  useEffect(
    () => () => {
      if (reset.current !== null) window.clearTimeout(reset.current);
      releaseRefreshHold(holdId);
    },
    [holdId],
  );

  async function buy() {
    if (busy.current) return;
    busy.current = true;
    const clickedAt = performance.now();
    // Binnen één frame: de knop zegt het al, de server moet het nog zeggen.
    setBought(true);
    takeRefreshHold(holdId);
    let held = true;
    try {
      const { error, data } = await kamerPostFor<{ spent: number; first?: boolean; balance?: number }>(
        `/api/kamers/${roomId}/plekken/${slotId}/buy`,
        { entryId },
        words,
      );
      if (error) {
        setBought(false);
        ui.toast(error);
        return;
      }
      /*
       * §103 golf H (T8): het saldo rolt nu, in hetzelfde moment als de
       * melding, naar de balans die de server net gaf — niet pas als de rij
       * na de stempel ververst. Alleen de rij wacht.
       */
      announceBalance(roomId, data?.balance);
      // §103 (K2/K5): het briefje voor de tegel, met *Ingericht* als dit de eerste koop was.
      markLanding({ slotId, entryId, first: Boolean(data?.first) });
      // K8: een stempel, als het geluid aanstaat.
      play('stempel');
      /*
       * Wat er gebeurd is, en waar het heen is. De prijs staat erbij omdat het
       * saldo bovenaan met één cijfer verandert en dat te makkelijk te missen
       * is — en het is de prijs die deze knop toch al droeg, geen som: dit
       * scherm rekent nooit een saldo uit (§79 regel 1).
       */
      const where = fill(words.boughtHere, { ding: name, plek: plekWord(kind, words) });
      // §93: met *Ongedaan maken* erbij, tien seconden lang (`buyToast`).
      buyToast(ui, router, {
        message: `${where} −${munt(price, words)}`,
        roomId,
        entryId,
        show: roomSlug
          ? { label: words.toastShow, onAction: () => router.push(`/kamer/${roomSlug}#plek-${slotId}`) }
          : undefined,
        words,
      });
      /*
       * §103 herstel (#6): de nieuwe rij pas als de stempel geland is en even
       * gelegen heeft. Deze timer wordt met opzet níét opgeruimd bij het
       * afbreken: wie in die 640 ms een filterchip indrukt, haalt deze rij weg,
       * en het saldo moet dan nog steeds de nieuwe waarde van de server krijgen.
       */
      const hold = holdBeforeRefresh(
        clickedAt,
        performance.now(),
        reducedMotion() ? 0 : tokenMs('--dur-4', 240),
        tokenMs('--dur-5', 400),
      );
      held = false;
      window.setTimeout(() => {
        releaseRefreshHold(holdId);
        router.refresh();
      }, hold);
      /*
       * Meestal verdwijnt deze knop met de nieuwe rij. Kan er nóg een (§83: een
       * tweede leesstoel mag), dan staat hij er na de stempel weer gewoon.
       */
      reset.current = window.setTimeout(() => setBought(false), hold + 1500);
    } finally {
      busy.current = false;
      // Een weigering of een fout laat de verversing meteen weer los.
      if (held) releaseRefreshHold(holdId);
    }
  }

  const plek = plekWord(kind, words);
  // De hele zin, voor een schermlezer en voor wie de naam niet ziet: §90's informatie.
  const full = fill(words.buyLandsOn, {
    knop: withPrice(buyerName ? fill(words.shopForName, { naam: buyerName }) : words.buy, price, words),
    plek,
  });
  /*
   * De regel voor het oog: *Kopen → bureau*, altijd dezelfde.
   * §103 golf H (T17): de naam kwam op de knop zodra de kiezer uit beeld
   * scrolde, dus alle knoppen groeiden terwijl de duim bewoog. Nu staat de
   * koper één keer in een plakkende kop (`KoperKop`), en de knop verandert
   * niet meer. De hele zin met de naam blijft de toegankelijke naam (§90).
   * §103 herstel (#18): de prijs staat als stempel erboven; `{n}` mag er in een eigen woord nog in.
   */
  const short = fill(words.buyShort, { knop: words.buy, n: String(price), plek });

  return (
    <button
      type="button"
      /*
       * §103 golf H (D7): een inktknop, geen rode vulling. Met saldo stonden
       * er per scherm vijf rode knoppen onder vijf rode stempels. De stempel
       * draagt nu het rood; de knop wordt pas rood onder de muis of de focus
       * (`.winkel-koop` in `app/kamer.css`).
       */
      className={`btn btn-small winkel-koop${bought ? ' winkel-koop-gekocht' : ''}`}
      data-testid="winkel-koop"
      data-bought={bought ? 'ja' : undefined}
      aria-disabled={bought || undefined}
      onClick={() => void buy()}
    >
      {/*
        De regel blijft staan (onzichtbaar als er gekocht is), zodat de knop
        niet krimpt als *Gekocht* korter is: de rij verspringt niet onder de
        hand. De stempel ligt eroverheen.
      */}
      <span className="koop-regel" aria-hidden={bought || undefined}>
        <Icon name={MEANING.munt} size={13} />
        <span aria-hidden="true">{short}</span>
        {/* De hele zin ook als tekst, zodat wie de knop op zijn woorden zoekt hem vindt. */}
        <span className="visually-hidden">{full}</span>
      </span>
      {bought && (
        // §103 (K2): de stempel komt neer — `.koop-stempel` in `app/kamer.css`.
        <span className="koop-stempel" data-testid="winkel-gekocht">
          <Icon name={MEANING.gekocht} size={13} />
          {words.buyBought}
        </span>
      )}
    </button>
  );
}
