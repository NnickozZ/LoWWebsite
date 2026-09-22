'use client';

import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fill } from '@/lib/words';
import { CHOICE_PARAM } from '@/lib/canvas/memory';

/**
 * §94 (C20) — de deur van een artikel naar de stamboom waarin het staat.
 *
 * Op een telefoon is `/stambomen` niet in de tabbalk (§66: acht tabs, Nicks
 * keuze), en de enige weg van *Marinus de Kok* naar zijn familie was *Genoemd
 * in (18)*: onderaan, dichtgeklapt, tussen zeventien andere rijen. Nu staat er
 * naast *Verbindingen* een deur per stamboom, en die opent met deze persoon al
 * gekozen (`?node=entry:{id}`, §94 C5) — de `+`-handgrepen hangen er meteen aan.
 *
 * **Dezelfde gegevens als *Genoemd in***: de pagina geeft de rijen van
 * `listMentions` met `kind: 'family_tree'` door, dus per lezer, per kant en met
 * `in_web` precies zoals die lijst (rule 1: een stamboom die je niet mag zien
 * staat hier niet). Een context en geen prop, zodat `EntryView` er één regel
 * voor draagt.
 */
/** A stamboom as *Genoemd in* has it: `href` is `/stambomen/{slug}`. */
export type InTree = { id: string; name: string; href: string };

const TreesOfEntry = createContext<{ entryId: string; trees: InTree[] }>({ entryId: '', trees: [] });

export function EntryTreesProvider({
  entryId,
  trees,
  children,
}: {
  entryId: string;
  trees: InTree[];
  children: ReactNode;
}) {
  return <TreesOfEntry.Provider value={{ entryId, trees }}>{children}</TreesOfEntry.Provider>;
}

export function InTreeDoors() {
  const ui = useUi();
  const { entryId, trees } = useContext(TreesOfEntry);
  if (!entryId || !trees.length) return null;
  return (
    <>
      {trees.map((tree) => (
        <Link
          key={tree.id}
          className="btn btn-small"
          href={`${tree.href}?${CHOICE_PARAM.family_tree}=${encodeURIComponent(`entry:${entryId}`)}`}
          data-testid="entry-in-tree"
        >
          <Icon name="tree" size={15} />
          {fill(ui.words.entryInTree, { stamboom: ui.words.familyTree, naam: tree.name })}
        </Link>
      ))}
    </>
  );
}
