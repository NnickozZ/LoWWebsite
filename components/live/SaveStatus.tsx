'use client';

import { Icon } from '@/components/Icon';
import { saveLabel } from '@/components/entry/useAutosave';
import type { Words } from '@/lib/words';
import { useSaveStatus } from './saveRegister';

/**
 * §100 (B14): het ene opslaan-woord, naast de live-stip.
 *
 * Eén plek voor elke pagina die schrijft — artikel, dossier, prikbord,
 * stamboom, de tekenlaag, het Keeperpaneel — gevoed door `saveRegister`. De
 * zinnen zijn die van `saveLabel`, dus "Opslaan…", "Opgeslagen" en §90's
 * "Nog niet opgeslagen — wordt bewaard …" (B15) staan er letterlijk zoals ze
 * op het artikel stonden; een fout met een eigen zin van het archief (§61)
 * draagt die zin.
 *
 * `.save-state` is de klasse die tientallen specs lezen, en er is er nu per
 * pagina precies één. Staat er geen schrijver op de pagina, dan is hij er
 * niet; staat er een die nog niets zei (`idle`), dan is hij er leeg en al op
 * zijn breedte, zodat de eerste toets niets opzij duwt (B13).
 *
 * Een fout is luider dan bezig: hij wint in `combineReports`, hij is rood, en
 * op een telefoon op een tekenvlak — waar het woord anders alleen een teken is
 * — staat zijn zin er voluit.
 */
export function SaveStatus({ words }: { words: Words }) {
  const save = useSaveStatus();
  if (save.state === 'none') return null;
  const state = save.state;
  const word = state === 'error' && save.message ? save.message : saveLabel(state, words);
  const loud = state === 'error' || state === 'offline';
  return (
    <p
      className={`save-state${loud ? ' save-state-loud' : ''}`}
      data-testid="save-state"
      data-save={state}
      role="status"
      aria-live="polite"
      title={word || undefined}
    >
      {state !== 'idle' && (
        <span className="save-state-mark" aria-hidden="true">
          {state === 'saved' ? (
            <Icon name="check" size={12} />
          ) : loud ? (
            '!'
          ) : (
            <span className="save-state-busy" />
          )}
        </span>
      )}
      <span className="save-state-word">{word}</span>
    </p>
  );
}
