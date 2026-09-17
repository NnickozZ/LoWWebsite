'use client';

import { useCallback, useState } from 'react';
import { useIsPhone } from '@/components/useIsPhone';

/**
 * §73 — lezen en bewerken, op elk glas.
 *
 * Nick, round 37: *"Moving things accidentally is very easy. I think we need a
 * Read and Edit mode on all things. Things that have a camera and are subject
 * to phone accidents should start in editing mode on pc but reading mode on
 * phone."*
 *
 * A canvas asks this hook one question — **is the hand allowed to change the
 * drawing right now?** — and answers it at its own gates. What `editing: false`
 * turns off is the same list everywhere (Nick's choice, round 37):
 *
 * - **moving** a thing: a card, a speld, a gebeurtenis, a kaartje, a knot of
 *   the web; and the arranging that is moving by another name (a speld's laag,
 *   a card's grip, a draad pulled from a punaise, the `+` handles of a tree);
 * - **making** a thing: a double-click or long press on bare paper, and the
 *   toolbar buttons that put something new on the glass;
 * - **the potlood**.
 *
 * What it leaves alone: the camera (pan, knijp, wheel, buttons), choosing, and
 * opening — a tap still opens what it opened. A panel's own buttons stay: they
 * are a deliberate press, not an accident waiting for a thumb.
 *
 * Two rules the shape of this hook keeps:
 *
 * - **Fresh on every visit** (Nick's choice). Nothing is stored: an accident
 *   can never be carried over from yesterday's session, and a phone always
 *   opens in Lezen. That is also why this is state and not a context — each
 *   canvas is its own visit.
 * - **Rights come first.** A hand that may not edit this drawing at all is
 *   always reading and gets no switch (`canEdit: false`); the mode narrows a
 *   right, it never grants one.
 *
 * The server renders every canvas as a desktop (`useIsPhone` is false there),
 * so a phone hydrates in Bewerken and turns to Lezen on its first client render
 * — before a finger can have reached the glass.
 */
export type CanvasMode = 'read' | 'edit';

export function useCanvasMode(canEdit: boolean) {
  const isPhone = useIsPhone();
  const [choice, setChoice] = useState<CanvasMode | null>(null);
  const mode: CanvasMode = !canEdit ? 'read' : (choice ?? (isPhone ? 'read' : 'edit'));
  const setMode = useCallback((next: CanvasMode) => setChoice(next), []);
  return { mode, editing: mode === 'edit', canEdit, setMode };
}

export type CanvasModeState = ReturnType<typeof useCanvasMode>;
