'use client';

import { useEffect, useRef, useState } from 'react';
import { deltaChip, reducedMotion, rollValue, tokenMs } from './moment';
import { shownBalance, useAnnounced } from './saldo';

/**
 * §103 (K3): het saldo rolt — tussen twee waarden van de server, en nooit ervóór.
 *
 * §79 zegt dat het scherm nooit zelf meetelt, en dat blijft: dit component
 * kent twee getallen, het vorige en het nieuwe `value` dat van boven kwam
 * (`purseOf`, `RoomView.balance`, `Shop.balance`), en telt in ~500 ms van het
 * ene naar het andere. Het voorspelt niets, telt niets op en kent geen prijs.
 * Een koop die mislukt, verandert dus ook niets aan dit getal: de server gaf
 * geen nieuwe waarde.
 *
 * Naast het getal staat 1,5 s een chip met het verschil (`+12`, `−2`), groen
 * voor erbij (`--live`) en gedempt voor eraf — **nooit rood**: rood is de
 * stempel en de Keeper (§84), en een saldo is geen van beide. Het verschil is
 * ook geen som: het is de nieuwe serverwaarde min de vorige.
 *
 * - **Een eerste render beweegt niet.** Wie een pagina opent, ziet zijn saldo.
 * - **Reduced motion**: het getal staat er meteen, de chip blijft (feedback is
 *   geen beweging, §102 regel 8).
 * - `tabular-nums` zodat het getal tijdens het rollen niet heen en weer schuift.
 *
 * `side` zegt waar de chip hangt, want dit getal staat op drie plekken met drie
 * soorten ruimte: links naast de staart in de zijbalk (`voor`), boven de beurs
 * in de kamer en de winkel en boven het poppetje van de Jij-tab (`boven`). De
 * chip is `position: absolute` tegen de omringende vorm, zodat het getal zelf
 * niet opzij schuift als hij verschijnt.
 */
export function SaldoGetal({
  value: fromAbove,
  className,
  side = 'boven',
  room,
  chip: withChip = true,
}: {
  value: number;
  className?: string;
  side?: 'voor' | 'boven';
  /**
   * §103 golf H (T8): van welke kamer dit saldo is, zodat een antwoord van de
   * server (`announceBalance`) het meteen bereikt. Weggelaten is de kamer van
   * de schil (zie `saldo.ts`); `null` volgt niets.
   */
  room?: string | null;
  /** §103 golf H (T14): zonder chip, waar de plek al een eigen chip tekent (de uitdeler, K7). */
  chip?: boolean;
}) {
  /*
   * §103 golf H (T8): het getal dat telt is de nieuwste serverwaarde — de prop
   * van boven, of het antwoord van een knop dat de verversing nog niet heeft
   * ingehaald (`shownBalance`). Nooit een som.
   */
  const announced = useAnnounced(room);
  const [hold, setHold] = useState<{ basis: number; balance: number } | null>(null);
  const heard = useRef<number | null>(null);
  const above = useRef(fromAbove);
  above.current = fromAbove;
  useEffect(() => {
    if (!announced || announced.seq === heard.current) return;
    heard.current = announced.seq;
    setHold({ basis: above.current, balance: announced.balance });
  }, [announced]);
  const value = shownBalance(fromAbove, hold);

  const [shown, setShown] = useState(value);
  const [chip, setChip] = useState<{ delta: number; n: number; leaving: boolean } | null>(null);
  const previous = useRef(value);
  const frame = useRef<number | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    // De chip: het verschil tussen twee antwoorden van de server.
    for (const timer of timers.current) window.clearTimeout(timer);
    const n = Date.now();
    setChip({ delta: value - from, n, leaving: false });
    timers.current = [
      window.setTimeout(() => setChip((c) => (c && c.n === n ? { ...c, leaving: true } : c)), 1500),
      window.setTimeout(
        () => setChip((c) => (c && c.n === n ? null : c)),
        1500 + tokenMs('--dur-3', 150),
      ),
    ];

    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    // ~500 ms: de langste expressieve duur, iets gerekt voor een getal dat telt.
    const duration = tokenMs('--dur-5', 400) * 1.25;
    const start = performance.now();
    const step = (now: number) => {
      const progress = (now - start) / duration;
      setShown(rollValue(from, value, progress));
      frame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }, [value]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  return (
    <>
      <span className={`saldo-getal${className ? ` ${className}` : ''}`} data-rolling={shown !== value ? 'ja' : undefined}>
        {shown}
      </span>
      {withChip && chip && (
        <span
          className={`saldo-chip saldo-chip-${side}`}
          data-testid="saldo-chip"
          data-richting={chip.delta > 0 ? 'erbij' : 'eraf'}
          data-leaving={chip.leaving ? 'ja' : undefined}
          aria-hidden="true"
        >
          {deltaChip(chip.delta)}
        </span>
      )}
    </>
  );
}
