'use client';

import { useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react';
import type { Words } from '@/lib/words';
import { reducedMotion, takeLanding, takeUnlock, tokenMs } from './moment';

/** Hoe lang de ring om een tegel staat die net iets kreeg (K1's 1,4 s, als tijd en niet als animatie). */
const RING_MS = 1400;
/** Hoe lang *Ingericht* blijft liggen nadat hij neerkwam (K5). */
const STAMP_STAYS_MS = 2500;

/*
 * De twee lijnen van `lock` in `components/Icon.tsx`, los van elkaar: de beugel
 * draait, het slot valt. (Een pad, geen zin — vandaar de backticks, zodat de
 * woordentest van `kamer-contract.test.ts` er niet over valt.)
 */
const BEUGEL = `M7 11V8a5 5 0 0 1 10 0v3`;
const SLOT = `M5 11h14v9H5z`;

/** Timers die met het component opruimen. */
function useTimers() {
  const timers = useRef<number[]>([]);
  useLayoutEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );
  return (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
}

/**
 * §103 (K2/K5): het ding landt op de tegel.
 *
 * Tot deze ronde stond een gekocht of neergezet ding er ineens: in de winkel
 * werd een knop grijs, in de kamer verscheen een omslag. Nu komt het beeld van
 * het ding (de omslag, of het icoon van de plek, T2) 12 px van boven met een
 * schaal van 0,96, overschiet een paar pixels en zakt terug — 400 ms op
 * `--ease-land`, die zelf overschiet (y 1,56: ongeveer 7 px bij 12 px val). De
 * tegel krijgt 1,4 s een ring, zodat je tussen twaalf tegels ziet wáár het
 * landde; onder reduced motion is de ring er wel en de val niet.
 *
 * **Precies één keer per plaatsing.** De tegel speelt alleen als de hand die
 * het deed een briefje achterliet (`markLanding` in `moment.ts`), en neemt dat
 * briefje mee. Een refresh, een herladen of een live-update van een ander vindt
 * geen briefje en blijft stil. De sleutel is de plek plus het ding, en na
 * `takeLanding` is hij weg.
 *
 * **Bij de eerste koop ooit in deze kamer** (de server zegt het: `first` uit
 * `buyFurnishing`, gelezen uit het grootboek) komt er één stempel bij:
 * *Ingericht*, schuin, 600 ms, en na 2,5 s vervaagt hij. Niet bij een tweede
 * koop, niet bij neerzetten, niet bij opslaan (§102 regel 7: vieren is zeldzaam).
 *
 * Het component is `display: contents`: het voegt geen doos toe aan de flex-
 * kolom van de tegel, alleen een haakje voor de selector
 * (`.plek-neerzet[data-landing] .plek-cover`) en twee lagen erboven.
 */
export function Neerzetten({
  slotId,
  entryId,
  words,
  children,
}: {
  slotId: string;
  entryId: string;
  words: Words;
  children: ReactNode;
}) {
  const [landing, setLanding] = useState(false);
  const [ring, setRing] = useState(false);
  const [stamp, setStamp] = useState<'in' | 'uit' | null>(null);
  const later = useTimers();

  // Vóór de eerste verf: anders staat het ding er één frame en springt het dan omhoog.
  useLayoutEffect(() => {
    const mark = takeLanding(slotId, entryId);
    if (!mark) return;
    // Onder reduced motion geen val, wel de ring (§102 regel 8).
    if (!reducedMotion()) setLanding(true);
    setRing(true);
    later(() => setRing(false), RING_MS);
    if (mark.first) {
      setStamp('in');
      /*
       * §103 golf H (T21): *Ingericht* komt pas ná de landing neer (een
       * `--dur-5` wachten, dan `--dur-4` × 1,25 vallen; `app/kamer.css`), en in
       * de hoek over de naam in plaats van midden over het ding: eerst zie je
       * het ding landen, dan de viering.
       */
      const lands = tokenMs('--dur-5', 400) + tokenMs('--dur-4', 240) * 1.25;
      later(() => setStamp('uit'), lands + STAMP_STAYS_MS);
      later(() => setStamp(null), lands + STAMP_STAYS_MS + tokenMs('--dur-3', 150));
    }
    // `later` is een nieuwe functie per render en hoort niet in de lijst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId, entryId]);

  const landed = (event: AnimationEvent) => {
    if (event.animationName === 'kamer-neerzet') setLanding(false);
  };

  return (
    <div className="plek-neerzet" data-landing={landing ? 'ja' : undefined} onAnimationEnd={landed}>
      {children}
      <span className="plek-ring" data-on={ring ? 'ja' : undefined} data-testid="plek-ring" aria-hidden="true" />
      {stamp && (
        <span
          className="stamp plek-ingericht"
          data-testid="plek-ingericht"
          data-leaving={stamp === 'uit' ? 'ja' : undefined}
          aria-hidden="true"
        >
          {words.furnishedStamp}
        </span>
      )}
    </div>
  );
}

/**
 * §103 (K5): een plek die net openging. Het slotje draait open (200 ms) en valt
 * weg, en de tegel toont zijn lege staat met een zachte ring. Alleen voor de
 * hand die hem opende (`markUnlock` in `UnlockButton`), en één keer.
 *
 * Het slotje is een eigen tekening en niet `<Icon name="lock">`, omdat de beugel
 * los van het slot moet kunnen draaien: dezelfde twee lijnen als het icoon, in
 * twee paden.
 */
export function Ontsloten({ slotId, children }: { slotId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(false);
  const later = useTimers();

  useLayoutEffect(() => {
    if (!takeUnlock(slotId)) return;
    // Onder reduced motion geen draaiend slotje, alleen de zachte ring.
    if (!reducedMotion()) setOpen(true);
    setRing(true);
    later(() => setRing(false), RING_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId]);

  const gone = (event: AnimationEvent) => {
    if (event.animationName === 'kamer-slot-valt') setOpen(false);
  };

  return (
    <div className="plek-neerzet" data-ontsloten={open ? 'ja' : undefined}>
      {children}
      {open && (
        <span className="plek-slotje" data-testid="plek-slotje" aria-hidden="true" onAnimationEnd={gone}>
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path className="plek-slotje-beugel" d={BEUGEL} />
            <path d={SLOT} />
          </svg>
        </span>
      )}
      <span className="plek-ring plek-ring-zacht" data-on={ring ? 'ja' : undefined} aria-hidden="true" />
    </div>
  );
}
