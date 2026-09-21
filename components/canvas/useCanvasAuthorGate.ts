'use client';

import { useMemo } from 'react';
import { useAuthorGate } from '@/components/you/AuthorProvider';
import { gateAsks } from '@/lib/canvas/authorGate';

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

export function useCanvasAuthorGate(writing: boolean) {
  const gate = useAuthorGate();
  return useMemo(
    () => ({
      onFocusCapture: (event: Evt) => {
        if (gateAsks(writing, event.target)) gate.onFocusCapture();
      },
      onKeyDownCapture: (event: Evt) => {
        if (gateAsks(writing, event.target)) gate.onKeyDownCapture();
      },
      onPointerDownCapture: (event: Evt) => {
        if (gateAsks(writing, event.target)) gate.onPointerDownCapture();
      },
    }),
    [gate, writing],
  );
}
