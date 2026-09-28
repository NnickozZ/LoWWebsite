'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { PlekKind } from '@/lib/kamers/shape';
import { fill, type Words } from '@/lib/words';
import { MEANING, plekWord } from './plekWords';
import { kamerPost } from './post';
import { markLanding } from './moment';
import { toastKeyOf } from './buyToast';
import { play } from '@/lib/sound/klank';

/**
 * §93 (E10): verplaatsen, als tik-tik en nooit als slepen (WCAG 2.5.7).
 *
 * Tot §93 was verplaatsen drie handelingen en een gok: ×, dan *Neerzetten* op
 * een andere tegel, dan het ding terugzoeken — en tussendoor was het van
 * niemand. Nu: *Verplaatsen* op de gevulde tegel, en elke open lege plek waar
 * het op past krijgt een knop *Hierheen*. Eén tik verplaatst (`moveItem`: één
 * transactie, twee rijen). Escape, *Annuleren* of een tik ernaast stopt.
 *
 * De staat is van het raster, niet van één tegel: de knop staat op de ene
 * tegel en de bestemmingen op de andere. Het raster zelf blijft wat de pagina
 * op de server tekent — dit component wikkelt er alleen een `<ul>` omheen die
 * weet wat er bewogen wordt.
 */

/** §103: `entryId` zodat het ding op de nieuwe plek kan landen (`markLanding`). */
type Moving = { slotId: string; entryId: string; name: string; plekken: PlekKind[] };

type MoveValue = {
  moving: Moving | null;
  /** §103 herstel (#21): de open, lege plekken — om te weten of een ding ergens heen kán. */
  targets: { id: string; kind: PlekKind }[];
  start: (moving: Moving, from: HTMLElement) => void;
  cancel: (restoreFocus?: boolean) => void;
};

const MoveContext = createContext<MoveValue | null>(null);

export function KamerGrid({
  label,
  targets,
  words,
  children,
}: {
  label: string;
  /** De open, lege plekken van deze kamer met hun soort — om te weten of er ergens heen kán. */
  targets: { id: string; kind: PlekKind }[];
  words: Words;
  children: ReactNode;
}) {
  const [moving, setMoving] = useState<Moving | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  const cancel = useCallback((restoreFocus = true) => {
    setMoving(null);
    // De focus terug naar de knop waar het begon — een toetsenbord verdwaalt
    // anders. Niet na een tik ernaast: die tik had zelf een doel.
    const back = opener.current;
    opener.current = null;
    if (restoreFocus && back?.isConnected) back.focus();
  }, []);

  const start = useCallback((next: Moving, from: HTMLElement) => {
    opener.current = from;
    setMoving(next);
  }, []);

  useEffect(() => {
    if (!moving) return;
    // De eerste bestemming krijgt de focus, zodat Enter meteen verplaatst.
    const first = gridRef.current?.querySelector<HTMLButtonElement>('.plek-move-here');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    };
    // Een tik ernaast annuleert: alles wat geen bestemming, geen knop van
    // het verplaatsen zelf en niet de balk erboven is.
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.plek-move-here, .plek-move, .kamer-move-bar')) return;
      cancel(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [moving, cancel]);

  const anywhere = moving ? canMoveAnywhere(moving.plekken, targets) : false;

  return (
    <MoveContext.Provider value={{ moving, targets, start, cancel }}>
      {/*
        §103 golf H (D8b): de balk zweeft onderaan het venster, boven de
        meldingen (`position: fixed`, 240 ms in op `--ease-enter`). Hij stond in
        de flow boven het raster: het raster zakte 67 px zodra je *Verplaatsen*
        koos, en sprong na *Hierheen* weer omhoog — precies terwijl je een tegel
        aan het aanwijzen was.
      */}
      {moving && (
        <p className="kamer-move-bar" role="status" data-testid="kamer-move-bar">
          <Icon name={MEANING.verplaatsen} size={14} />
          <span className="kamer-move-bar-text">
            {anywhere ? fill(words.moveHint, { ding: moving.name }) : words.moveNowhere}
          </span>
          <button type="button" className="btn btn-small" data-testid="kamer-move-cancel" onClick={() => cancel()}>
            {words.moveCancel}
          </button>
        </p>
      )}
      <ul
        ref={gridRef}
        className="kamer-grid"
        data-testid="kamer-grid"
        data-moving={moving ? 'ja' : undefined}
        aria-label={label}
      >
        {children}
      </ul>
    </MoveContext.Provider>
  );
}

/** §103 herstel (#21): past dit ding op één van de open, lege plekken? Puur, zodat de regel te testen is. */
export function canMoveAnywhere(plekken: readonly PlekKind[], targets: readonly { kind: PlekKind }[]): boolean {
  return targets.some((slot) => plekken.includes(slot.kind));
}

/** Op een gevulde tegel: begin met verplaatsen (of stop, als je al bezig was met dit ding). */
export function MoveButton({
  slotId,
  entryId,
  name,
  plekken,
  words,
}: {
  slotId: string;
  entryId: string;
  name: string;
  plekken: PlekKind[];
  words: Words;
}) {
  const move = useContext(MoveContext);
  if (!move) return null;
  /*
   * §103 herstel (#21): geen knop die naar een doodlopende balk leidt. Is er
   * geen open, lege plek van een soort waar dit ding op past, dan valt er niets
   * te verplaatsen en staat de knop er niet — de pagina rendert opnieuw zodra
   * er een plek opengaat of leeg komt, en dan staat hij er wel.
   */
  if (!canMoveAnywhere(plekken, move.targets)) return null;
  const active = move.moving?.slotId === slotId;
  const label = fill(words.slotMoveOne, { ding: name });
  return (
    <button
      type="button"
      className="btn btn-ghost plek-move"
      data-testid="plek-move"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(event) => {
        if (active) move.cancel();
        else move.start({ slotId, entryId, name, plekken }, event.currentTarget);
      }}
    >
      <Icon name={MEANING.verplaatsen} size={14} />
    </button>
  );
}

/** Op een lege, open plek: de bestemming, als het ding dat bewogen wordt hier past. */
export function MoveHere({
  roomId,
  slotId,
  kind,
  guestOf = null,
  words,
}: {
  roomId: string;
  slotId: string;
  kind: PlekKind;
  guestOf?: string | null;
  words: Words;
}) {
  const move = useContext(MoveContext);
  const ui = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const moving = move?.moving;
  if (!move || !moving || !moving.plekken.includes(kind)) return null;

  async function here() {
    if (!moving || !move) return;
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${moving.slotId}/move`, { to: slotId }, words);
      if (error) {
        ui.toast(error);
        return;
      }
      /*
       * §103 (K2, G7): de doeltegel licht op en het ding landt — het briefje
       * voor de tegel die zo meteen gevuld terugkomt, en een houten tik (K8,
       * alleen als het geluid aanstaat).
       */
      markLanding({ slotId, entryId: moving.entryId, first: false });
      play('tik');
      /*
       * §103 golf H (D9/T15): *Kaartenkast verplaatst naar de plank.* — het
       * werkwoord van wat er gebeurde, niet nog eens *ligt nu op je plank*
       * (dat zei de koop al). En met de sleutel van het ding: deze melding
       * vervangt die van de koop op haar plek in plaats van eronder te komen.
       */
      ui.toast(
        guestOf
          ? fill(words.movedToOf, { ding: moving.name, plek: plekWord(kind, words), naam: guestOf })
          : fill(words.movedTo, { ding: moving.name, plek: plekWord(kind, words) }),
        undefined,
        { key: toastKeyOf(moving.entryId) },
      );
      move.cancel();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-primary plek-move-here"
      data-testid="plek-move-here"
      aria-label={fill(words.moveHereOne, { ding: moving.name })}
      disabled={busy}
      onClick={() => void here()}
    >
      <Icon name={MEANING.verplaatsen} size={15} />
      {words.moveHere}
    </button>
  );
}
