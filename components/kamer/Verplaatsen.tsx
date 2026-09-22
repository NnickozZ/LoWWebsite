'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import type { PlekKind } from '@/lib/kamers/shape';
import { fill, type Words } from '@/lib/words';
import { MEANING, plekWord } from './plekWords';
import { kamerPost } from './post';

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

type Moving = { slotId: string; name: string; plekken: PlekKind[] };

type MoveValue = {
  moving: Moving | null;
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

  const anywhere = moving ? targets.some((slot) => moving.plekken.includes(slot.kind)) : false;

  return (
    <MoveContext.Provider value={{ moving, start, cancel }}>
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

/** Op een gevulde tegel: begin met verplaatsen (of stop, als je al bezig was met dit ding). */
export function MoveButton({
  slotId,
  name,
  plekken,
  words,
}: {
  slotId: string;
  name: string;
  plekken: PlekKind[];
  words: Words;
}) {
  const move = useContext(MoveContext);
  if (!move) return null;
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
        else move.start({ slotId, name, plekken }, event.currentTarget);
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
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${moving.slotId}/move`, { to: slotId });
      if (error) {
        ui.toast(error);
        return;
      }
      ui.toast(
        guestOf
          ? fill(words.boughtThere, { ding: moving.name, plek: plekWord(kind, words), naam: guestOf })
          : fill(words.boughtHere, { ding: moving.name, plek: plekWord(kind, words) }),
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
