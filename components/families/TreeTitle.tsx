'use client';

import { useEffect, useState } from 'react';
import { CanvasTitle } from '@/components/canvas/CanvasTitle';
import { useCanvasMode } from '@/components/canvas/useCanvasMode';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §34/§66 — de naam van de stamboom, in de ene plek waar een pagina een titel
 * heeft.
 *
 * **§69 (4.9): dit is nu een dun laagje over `CanvasTitle`.** De hele inhoud —
 * de kop *is* het vak, een lezer die niet mag bewerken krijgt platte tekst, een
 * hernoeming van iemand anders wordt overgenomen tenzij de caret in het vak
 * staat, en de eigen echo is geen nieuws — is verhuisd, woord voor woord, naar
 * `components/canvas/CanvasTitle.tsx`, omdat de landkaart en de tijdlijn het nu
 * ook doen. Wat hier blijft staan zijn de twee namen die specs gebruiken
 * (`family-tree-title` op de kop, `tree-name` op het vak) en de klasse
 * `.tree-title`, die de breedte van deze ene kop regelt.
 *
 * De oorspronkelijke reden staat nog steeds in `CanvasTitle`: het stond in twee
 * rijen — de §34-kop drukte de naam, en `.tree-bar` drukte hem nog eens in een
 * bewerkbaar vak — en dat was op 390 px ongeveer 330 px scherm om twee keer
 * hetzelfde te zeggen, vóór het glas ook maar iets kreeg.
 */
/**
 * §73: hernoemen is bewerken, dus in Lezen is de kop platte tekst.
 *
 * De kop staat in de §34-kop van de *pagina* en de schakelaar in de balk van
 * het *canvas*: twee broers die geen state delen. Het canvas zegt daarom bij
 * elke wissel welke stand deze stamboom heeft (`announceTreeMode`), en de kop
 * luistert. Tot het eerste bericht rekent de kop zelf uit wat het canvas ook
 * uitrekent (`useCanvasMode`: telefoon Lezen, bureau Bewerken), zodat hij niet
 * een tel lang een vak is op een telefoon.
 */
const TREE_MODE_EVENT = 'lo:tree-mode';

export function announceTreeMode(treeId: string, editing: boolean) {
  window.dispatchEvent(new CustomEvent(TREE_MODE_EVENT, { detail: { treeId, editing } }));
}

export function TreeTitle({
  id,
  name,
  canEdit,
}: {
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const ui = useUi();
  const fallback = useCanvasMode(canEdit);
  const [told, setTold] = useState<boolean | null>(null);
  useEffect(() => {
    const onMode = (event: Event) => {
      const detail = (event as CustomEvent<{ treeId: string; editing: boolean }>).detail;
      if (detail?.treeId === id) setTold(detail.editing);
    };
    window.addEventListener(TREE_MODE_EVENT, onMode);
    return () => window.removeEventListener(TREE_MODE_EVENT, onMode);
  }, [id]);
  const editing = told ?? fallback.editing;
  return (
    <CanvasTitle
      name={name}
      canEdit={canEdit && editing}
      endpoint={`/api/family-trees/${id}`}
      noun={`de ${ui.words.familyTree}`}
      inputId="tree-name"
      testId="family-tree-title"
      className="tree-title"
    />
  );
}
