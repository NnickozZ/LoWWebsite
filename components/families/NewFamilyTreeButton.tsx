'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { NewFamilyTreeSheet } from './NewFamilyTreeSheet';

/**
 * §66: a new stamboom.
 *
 * It asks less than a tijdlijn does — there is no measure to choose, because a
 * stamboom is measured in generations and the archive works those out itself —
 * so the sheet is a name, a line or two, and the two choices every container
 * makes: open or private (§17), and which side of the archive it is born on
 * (§48).
 *
 * §69: the sheet itself is `NewFamilyTreeSheet`, because the picker's
 * "'X' aanmaken" row opens the same one. This is the button and nothing else.
 */
export function NewFamilyTreeButton({
  caseId,
  caseKeeperOnly,
}: {
  caseId?: string;
  caseKeeperOnly?: boolean;
} = {}) {
  const ui = useUi();
  const words = ui.words;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* §69: ask who is writing *before* the sheet, never over it. */}
      <button type="button" className="btn btn-primary btn-small" onClick={() => ui.openMaker(() => setOpen(true))}>
        <Icon name="plus" size={15} />
        {caseId ? `Maak nieuwe ${words.familyTree} voor dit ${words.case}` : `Nieuwe ${words.familyTree}`}
      </button>

      {open && (
        <NewFamilyTreeSheet
          caseId={caseId}
          caseKeeperOnly={caseKeeperOnly}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
