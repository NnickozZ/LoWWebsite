'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * §34: the empty div a full-screen canvas's page leaves below the fold, and
 * the way into it.
 *
 * A landkaart and a stamboom take the screen, so anything in the canvas column
 * that is neither the one line of heading nor the canvas is a line taken off
 * the drawing. The Keeper's tekenlaag switch is a *tool* — 132 px of one on a
 * telephone, the difference between a stage that fills three-quarters of the
 * screen and one that fills under half, and only for a Keeper, so nobody sees
 * it until somebody measures it. It belongs below the fold with the rest of
 * the Keeper's tools, in the slot the page leaves after the canvas. (A
 * prikbord and a tijdlijn answer the same question with their Instellingen
 * sheet, which those two have and these two have not.)
 *
 * Placed after mount rather than rendered where it stands, so the block never
 * shows in the column and then jumps out of it. No slot — a player's page,
 * where there is nothing below the fold — means nothing to place.
 */
export function UnderFold({ slotId, children }: { slotId: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(slotId)), [slotId]);
  return slot ? createPortal(children, slot) : null;
}
