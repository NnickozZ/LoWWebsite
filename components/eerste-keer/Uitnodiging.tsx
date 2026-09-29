'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { inviteLink } from '@/lib/eerste-keer/stappen';

/**
 * §106 (golf i2): de uitnodiging zoals de Keeper hem wegstuurt — een link die de
 * code al in het vak zet (`/signup?code=…`), met de code zelf ernaast voor wie
 * hem liever voorleest. Alleen de Keeper krijgt dit te zien; de code komt van
 * de server en staat verder alleen in Beheer (§89). Beheer zelf verandert niet.
 */
export function Uitnodiging({ code }: { code: string }) {
  const ui = useUi();
  const words = ui.words;
  // De link hangt aan het adres waarop de Keeper het archief nu open heeft; dat
  // weet alleen de browser. Tot dan staat alleen het pad er.
  const [link, setLink] = useState(() => inviteLink('', code));
  useEffect(() => {
    setLink(inviteLink(window.location.origin, code));
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      ui.toast(words.inviteCopied, undefined, { key: 'uitnodiging' });
    } catch {
      ui.toast(words.inviteCopyFailed, undefined, { key: 'uitnodiging' });
    }
  }

  return (
    <div className="uitnodiging" data-testid="uitnodiging">
      <input
        className="input uitnodiging-link"
        value={link}
        readOnly
        aria-label={words.inviteCopyLink}
        onFocus={(event) => event.currentTarget.select()}
        data-testid="uitnodiging-link"
      />
      <button type="button" className="btn btn-small" onClick={() => void copy()} data-testid="uitnodiging-kopieer">
        <Icon name="link" size={15} />
        {words.inviteCopyLink}
      </button>
      <span className="uitnodiging-code">
        <span className="tiny muted">{words.inviteCodeLabel}</span> <code>{code}</code>
      </span>
    </div>
  );
}
