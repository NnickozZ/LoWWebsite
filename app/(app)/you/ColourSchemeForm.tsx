'use client';

import { useActionState } from 'react';
import { Icon } from '@/components/Icon';
import { COLOUR_SCHEME_CHOICES, type ColourScheme } from '@/lib/theme/schemes';
import { setColourSchemeAction, type ColourSchemeState } from './actions';

/**
 * §45: the half of the light this person reads the archive in.
 *
 * Three submit chips and no Save button, exactly as §29's Lettertype does it
 * two headings up — the choice is the action. The palette lands on the whole
 * archive by way of the signed-in layout, which reads it off the session, so
 * the page under the chips changes with everything else the moment the action
 * returns.
 *
 * There is no fourth chip for the Keeper's colours, on purpose: nothing stores
 * "this account uses the Keeper palette". A page that is the Keeper's own is
 * Keeper-coloured for whoever is looking at it, which is only ever a Keeper.
 */
export function ColourSchemeForm({
  current,
  isKeeper,
  keeperWord,
}: {
  current: ColourScheme;
  isKeeper: boolean;
  keeperWord: string;
}) {
  const [state, action, pending] = useActionState<ColourSchemeState, FormData>(
    setColourSchemeAction,
    {},
  );
  const chosen = state.scheme ?? current;
  const choice =
    COLOUR_SCHEME_CHOICES.find((item) => item.value === chosen) ?? COLOUR_SCHEME_CHOICES[0];

  return (
    <form action={action}>
      <div className="row-wrap" role="group" aria-label="Licht of donker">
        {COLOUR_SCHEME_CHOICES.map((item) => {
          const on = item.value === chosen;
          return (
            <button
              key={item.value || 'system'}
              type="submit"
              name="scheme"
              value={item.value}
              disabled={pending}
              aria-pressed={on}
              className={`chip chip-selectable${on ? ' chip-active' : ''}`}
            >
              {on && <Icon name="check" size={13} />}
              {item.label}
            </button>
          );
        })}
      </div>

      <p className="small muted" style={{ margin: '0.55rem 0 0' }}>
        {choice.hint}
      </p>

      <p className="tiny muted" style={{ margin: '0.35rem 0 0' }}>
        {isKeeper
          ? `De kleuren van de ${keeperWord} verschijnen vanzelf op de pagina’s die alleen van de ${keeperWord} zijn — daar hoef je niets voor te kiezen, licht of donker blijft jouw keuze.`
          : `De ${keeperWord} kiest de kleuren van het archief zelf; jij kiest alleen of je ze licht of donker leest.`}
      </p>

      {state.error && <p className="error-note">{state.error}</p>}
    </form>
  );
}
