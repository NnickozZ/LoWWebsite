'use client';

import { useSyncExternalStore } from 'react';
import { Icon } from '@/components/Icon';
import { onSoundChange, setSoundOn, soundOn } from '@/lib/sound/klank';
import type { Words } from '@/lib/words';

/**
 * §103 (K8): *Geluid in de kamer* — op `/you`, onder Lettertype en Kleuren, in
 * dezelfde vorm: een label en twee chips, en de uitleg achter *Waarom?*.
 *
 * Standaard uit (Nick). Bewaard in `localStorage` van deze browser, niet op het
 * account: het is een voorkeur van één kijker op één apparaat, zoals een
 * dichtgeklapt blok (`lib/sound/klank.ts`). Er wordt hier niets afgespeeld en
 * er wordt geen `AudioContext` gemaakt: aanzetten is instellen, geen geluid —
 * de eerste klank komt bij de eerste koop, opening of gift.
 *
 * Voor de server staat het uit (`getServerSnapshot`), zodat de eerste verf
 * nooit "aan" zegt voor iemand bij wie het uit staat.
 */
export function KlankSchakelaar({ words, why }: { words: Words; why: string }) {
  const on = useSyncExternalStore(onSoundChange, soundOn, () => false);
  const choices: { value: boolean; label: string }[] = [
    { value: false, label: words.soundOff },
    { value: true, label: words.soundOn },
  ];
  return (
    <div className="you-pref" id="geluid" data-testid="klank">
      <div className="row-wrap you-pref-row" role="group" aria-labelledby="klank-label">
        <span className="label you-pref-label" id="klank-label">
          {words.soundLabel}
        </span>
        {choices.map((choice) => {
          const active = choice.value === on;
          return (
            <button
              key={String(choice.value)}
              type="button"
              aria-pressed={active}
              className={`chip chip-selectable${active ? ' chip-active' : ''}`}
              data-testid={choice.value ? 'klank-aan' : 'klank-uit'}
              onClick={() => setSoundOn(choice.value)}
            >
              {active && <Icon name="check" size={13} />}
              {choice.label}
            </button>
          );
        })}
      </div>
      <div className="tiny muted you-pref-hint" data-testid="klank-hint">
        {/* §103 herstel (#24): één zin onder de chips, net als bij Lettertype en
            Kleuren — wat het geluid is en waar het klinkt. De rest achter *Waarom?*. */}
        <span>{words.soundHint}</span>{' '}
        <details className="you-why">
          <summary>{why}</summary>
          <span className="you-why-body">{words.soundNote}</span>
        </details>
      </div>
    </div>
  );
}
