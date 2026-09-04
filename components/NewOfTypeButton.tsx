'use client';

import { Icon } from './Icon';
import { useUi } from './ui/UiProvider';

/**
 * §11: what this button says is the soort's own business. It uses the wording
 * the Keeper gave that soort, then the archive-wide word for "new", then the
 * caller's own label — so a Locatie can say "Plek toevoegen" without every
 * other soort having to.
 */
export function NewOfTypeButton({ typeSlug, label }: { typeSlug: string; label?: string }) {
  const ui = useUi();
  const type = ui.types.find((item) => item.slug === typeSlug);
  const text = type?.newButton || label || ui.words.newOfType;

  return (
    <button type="button" className="btn btn-small" onClick={() => ui.openNewEntry({ typeSlug })}>
      <Icon name="plus" size={15} />
      {text}
    </button>
  );
}
