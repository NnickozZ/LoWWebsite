'use client';

import { Icon } from '@/components/Icon';
import { MAKE_EVENT } from '@/components/palette/useMakeOnArrival';
import { useUi } from '@/components/ui/UiProvider';

/**
 * §106 (golf i2): de deuren van een lege staat. Geen van drieën bouwt een
 * tweede weg (§5): ze drukken op de knop die er al was.
 *
 * - `ArtikelDeur` opent *Nieuw artikel* via `openNewEntry`, met de soort (en
 *   het dossier) van de plek waar je staat, en dus met §18b's vraag ervoor.
 * - `DossierDeur` opent *Nieuw dossier* via `openNewCase`.
 * - `MaakDeur` belt `MAKE_EVENT`, de bel die het palet (§100) al gebruikt als
 *   je op de lijst staat: de maakknop bovenaan de lijst (prikbord, tijdlijn,
 *   landkaart, stamboom) opent dan zijn eigen blad, langs `openMaker`. Zo
 *   hoeft geen van die vier knoppen te veranderen.
 *
 * Het label is altijd een werkwoord uit `lib/words.ts` en bewust níét het
 * label van de knop bovenaan ("Nieuwe tijdlijn", "Dossier openen"): specs en
 * schermlezers vinden die op hun naam, en twee knoppen met één naam op één
 * pagina is voor beide een raadsel.
 */

function Knop({
  label,
  icon = 'plus',
  primary,
  onClick,
  testId,
}: {
  label: string;
  icon?: string;
  primary?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`btn btn-small${primary ? ' btn-primary' : ''}`}
      onClick={onClick}
      data-testid={testId ?? 'lege-staat-deur'}
    >
      <Icon name={icon} size={15} />
      {label}
    </button>
  );
}

export function ArtikelDeur({
  label,
  typeSlug,
  caseId,
  primary,
  testId,
}: {
  label: string;
  typeSlug?: string;
  caseId?: string;
  primary?: boolean;
  testId?: string;
}) {
  const ui = useUi();
  return (
    <Knop
      label={label}
      icon="edit"
      primary={primary}
      testId={testId}
      onClick={() => ui.openNewEntry({ ...(typeSlug ? { typeSlug } : {}), ...(caseId ? { caseId } : {}) })}
    />
  );
}

export function DossierDeur({ label, primary, testId }: { label: string; primary?: boolean; testId?: string }) {
  const ui = useUi();
  return <Knop label={label} icon="folder" primary={primary} testId={testId} onClick={() => ui.openNewCase()} />;
}

export function MaakDeur({ label, icon }: { label: string; icon?: string }) {
  return <Knop label={label} icon={icon} onClick={() => window.dispatchEvent(new Event(MAKE_EVENT))} />;
}
