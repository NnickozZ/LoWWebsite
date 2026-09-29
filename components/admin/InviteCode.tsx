'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { fill } from '@/lib/words';
import { inviteLink } from '@/lib/eerste-keer/stappen';

/**
 * §107: de uitnodigingscode met een knop die kopieert en een melding die het
 * zegt. Op een telefoon die kan delen, staat er *Delen* naast: de code, de
 * naam van het archief en het adres van de inschrijving in één bericht.
 *
 * Review 4, L3: *Kopieer* zet dezelfde link op het klembord als de route op
 * Start (`inviteLink`, `/signup?code=…`, van golf i2), met dezelfde woorden en
 * dezelfde melding. De code staat er groot naast, voor wie hem voorleest.
 *
 * De code zelf blijft tekst (`user-select: all`), zodat één tik hem ook met de
 * hand selecteert als het klembord niet mag.
 */
export function InviteCode({
  code,
  archive,
  plek,
}: {
  code: string;
  archive: string;
  /**
   * Golf J (§107): `index` is de kopie bovenaan de index van Beheer op een
   * telefoon. Eigen testids, want Gebruikers staat verborgen in dezelfde DOM.
   */
  plek?: 'index';
}) {
  const pre = plek === 'index' ? 'index-' : '';
  const ui = useUi();
  const [canShare, setCanShare] = useState(false);
  const [link, setLink] = useState(() => inviteLink('', code));
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    setLink(inviteLink(window.location.origin, code));
  }, [code]);

  const copy = async () => {
    const ok = await copyText(link);
    ui.toast(ok ? ui.words.inviteCopied : ui.words.inviteCopyFailed, undefined, { key: 'uitnodiging' });
  };

  const share = async () => {
    try {
      await navigator.share({
        title: archive,
        text: fill(ui.words.inviteDeelTekst, { archief: archive, code }),
        url: link,
      });
    } catch {
      /* weggeklikt: niets aan de hand */
    }
  };

  return (
    <div className="invite-rij">
      <code className="invite-code" data-testid={`${pre}invite-code`}>
        {code}
      </code>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => void copy()}
        data-testid={`${pre}invite-kopieer`}
        data-link={link}
      >
        <Icon name="link" size={14} />
        {ui.words.inviteCopyLink}
      </button>
      {canShare && (
        <button type="button" className="btn btn-small btn-ghost" onClick={() => void share()}>
          <Icon name="upload" size={14} />
          {ui.words.delen}
        </button>
      )}
    </div>
  );
}

/** Naar het klembord; false als de browser het niet toestaat. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
