'use client';

import { CanvasTitle } from '@/components/canvas/CanvasTitle';
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
  return (
    <CanvasTitle
      name={name}
      canEdit={canEdit}
      endpoint={`/api/family-trees/${id}`}
      noun={`de ${ui.words.familyTree}`}
      inputId="tree-name"
      testId="family-tree-title"
      className="tree-title"
    />
  );
}
