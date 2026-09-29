'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useAuthorGate, useAuthorOptional } from '@/components/you/AuthorProvider';
import { AUTHOR_GATE_OFF, PRESS_SLOP, gateAsks, gatePress } from '@/lib/canvas/authorGate';

export { AUTHOR_GATE_OFF } from '@/lib/canvas/authorGate';

/**
 * §90 — de schrijfvraag op een tekenvlak, en alleen als er geschreven wordt.
 *
 * §18b vraagt "Met wie ben je nu aan het schrijven?" bij de eerste poging om te
 * *typen*. Op de vier tekenvlakken lag `useAuthorGate` om het hele glas, dus
 * vroeg één tik in **Lezen** (§73) het al: pannen, *Legenda*, *Alles in beeld*,
 * het zoekvak van de legenda. Een speler die alleen wilde kijken kreeg een
 * vraag over schrijven, en de tik die hij bedoelde was weg. Een telefoon begint
 * altijd in Lezen, dus daar was de eerste aanraking áltijd de vraag.
 *
 * Het hook in `AuthorProvider` blijft wat het is. Dit is hoe een glas het
 * gebruikt:
 *
 * - **Bewerken** (of het potlood in de hand): elke druk, toets of focus vraagt
 *   het, zoals voorheen — daar kan alles schrijven.
 * - **Lezen**: alleen een vak waarin je echt kunt typen (een paneel dat in
 *   Lezen blijft, §73: "de knoppen in een paneel blijven"). Het glas, de
 *   camera, de legenda en de schakelaar vragen niets.
 * - **Nooit**: alles onder `data-author-gate="off"` — een zoekvak dat alleen
 *   filtert is lezen, in welke stand ook.
 */
type Evt = { target: EventTarget | null };

type PressEvt = Evt & { clientX: number; clientY: number; pointerId: number };

/**
 * §105 (golf J): `where` names the glass and the things on it (see
 * `gatePress`). With it, a press on a thing asks only once it has become a
 * drag, a press on bare paper never, and a focus that lands on the glass only
 * when it lands in a box — so reading in Bewerken asks nothing.
 */
export function useCanvasAuthorGate(writing: boolean, where?: { glass: string; things: string }) {
  const gate = useAuthorGate();
  const glass = where?.glass;
  const things = where?.things;
  /** The press that may still become a drag: where it started, and on what. */
  const press = useRef<{ id: number; x: number; y: number; target: EventTarget | null } | null>(null);
  return useMemo(() => {
    const spot = glass && things ? { glass, things } : undefined;
    return {
      // §101: the event goes through, so the answer knows where to put the
      // caret back — and so a focus is told apart from a key or a press.
      onFocusCapture: (event: Evt) => {
        // A card or a speld that takes the focus is being looked at; its box is
        // what asks (`now`), and a key on it still asks below.
        if (gatePress(writing, event.target, spot) === 'now') gate.onFocusCapture(event);
      },
      onKeyDownCapture: (event: Evt) => {
        if (gateAsks(writing, event.target)) gate.onKeyDownCapture(event);
      },
      onPointerDownCapture: (event: PressEvt) => {
        const how = gatePress(writing, event.target, spot);
        if (how === 'now') {
          press.current = null;
          gate.onPointerDownCapture(event);
          return;
        }
        // A second finger is a pinch — looking, not moving the card.
        if (press.current) {
          press.current = null;
          return;
        }
        if (how === 'on-move') {
          press.current = { id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target };
        }
      },
      onPointerMoveCapture: (event: PressEvt) => {
        const held = press.current;
        if (!held || held.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - held.x, event.clientY - held.y) <= PRESS_SLOP) return;
        press.current = null;
        // The drag writes: now the question, with the thing as its origin.
        gate.onPointerDownCapture({ target: held.target });
      },
      onPointerUpCapture: () => {
        press.current = null;
      },
      onPointerCancelCapture: () => {
        press.current = null;
      },
    };
  }, [gate, writing, glass, things]);
}

/**
 * §101 — een maakknop op een tekenvlak: **vraag eerst, doe daarna**.
 *
 * The gate above is spread on the *surface*, and it only observes: it asks
 * §18b's question on the way down and lets the press carry on. For a press on
 * bare glass that is exactly right — nothing had started, and the answer hands
 * the caret back. For a **button** it is not: the question is a sheet, it is
 * painted in the same commit as the pointerdown, and the `click` that would
 * have followed lands on the backdrop instead. The person answers, nothing
 * happens, and they press the same button a second time. Measured after golf 3
 * on *Legenda*, *+ Ouder*, *Gebeurtenis toevoegen*, *Sectie toevoegen* and
 * *Nieuwe notitie*: two presses where one was promised.
 *
 * So a maker button takes the prikbord's road, which was the one that always
 * worked (§90): `ensureAuthor` holds the action, asks the question alone, and
 * the answer releases it — in the same commit that closes the question, so the
 * screen never carries two sheets. The props this returns carry both halves of
 * that and cannot be spread half-way:
 *
 *  - `data-author-gate="off"`, so the surface around it does **not** also ask
 *    on the way down (which is what ate the click);
 *  - an `onClick` that asks and then makes.
 *
 * Read-only controls on the same bar — a legend, a zoom, the mode switch, a
 * find — take plain `AUTHOR_GATE_OFF` and no question at all: they write
 * nothing, in either mode.
 */
export type MakerProps = typeof AUTHOR_GATE_OFF & { onClick: () => void };

export function useCanvasMaker(): (make: () => void) => MakerProps {
  const author = useAuthorOptional();
  const ensure = author?.ensureAuthor;
  return useCallback(
    (make: () => void) => ({
      ...AUTHOR_GATE_OFF,
      onClick: () => (ensure ? ensure(make) : make()),
    }),
    [ensure],
  );
}

/**
 * The same rule where the press is not a `<button>` of this component's own —
 * a picker's `onPick`, a menu item, a handle drawn by `TreeHandles`. Wrap the
 * callback rather than the button, and mark the control itself with
 * `AUTHOR_GATE_OFF` where it lives.
 */
export function useAskAuthorFirst(): (then: () => void) => void {
  const author = useAuthorOptional();
  const ensure = author?.ensureAuthor;
  return useCallback((then: () => void) => (ensure ? ensure(then) : then()), [ensure]);
}
