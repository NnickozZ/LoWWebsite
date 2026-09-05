'use client';

import { Icon } from './Icon';
import { useUi } from './ui/UiProvider';

/**
 * §11: what this button says is the soort's own business. It uses the wording
 * the Keeper gave that soort, then the archive-wide word for "new", then the
 * caller's own label — so a Locatie can say "Plek toevoegen" without every
 * other soort having to. Without a soort (the wiki's front page) it is the
 * plain "Nieuw artikel" button, and the sheet offers the last soort used.
 */
export function NewOfTypeButton({ typeSlug, label }: { typeSlug?: string; label?: string }) {
  const ui = useUi();
  const type = typeSlug ? ui.types.find((item) => item.slug === typeSlug) : undefined;
  const text = type?.newButton || label || (typeSlug ? ui.words.newOfType : ui.words.newEntry);

  return (
    <button type="button" className="btn btn-small" onClick={() => ui.openNewEntry(typeSlug ? { typeSlug } : {})}>
      <Icon name="plus" size={15} />
      {text}
    </button>
  );
}
