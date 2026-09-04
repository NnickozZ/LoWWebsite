'use client';

import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';

export function NewCaseButton({ label = 'Dossier openen' }: { label?: string }) {
  const ui = useUi();
  return (
    <button type="button" className="btn btn-primary btn-small" onClick={() => ui.openNewCase()}>
      <Icon name="plus" size={15} />
      {label}
    </button>
  );
}
