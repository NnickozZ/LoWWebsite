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
 *
 * §96 (S18): one compact row, like the Lettertype above it.
 *
 * §101: the note about the Keeper's colours was the group's `title`, and a
 * `title` does not exist on a phone. It is behind *Waarom?* now, the same fold
 * the karakters above use (`.you-why`).
 */
export function ColourSchemeForm({
  current,
  label,
  note,
  why,
}: {
  current: ColourScheme;
  label: string;
  /** §101: the sentence behind *Waarom?* — the Keeper's or a speler's, already filled in. */
  note: string;
  /** `words.youWhy`. */
  why: string;
}) {
  const [state, action, pending] = useActionState<ColourSchemeState, FormData>(
    setColourSchemeAction,
    {},
  );
  const chosen = state.scheme ?? current;
  const choice =
    COLOUR_SCHEME_CHOICES.find((item) => item.value === chosen) ?? COLOUR_SCHEME_CHOICES[0];

  return (
    <form action={action} className="you-pref" id="kleuren">
      <div
        className="row-wrap you-pref-row"
        role="group"
        aria-label="Licht of donker"
      >
        <span className="label you-pref-label" aria-hidden="true">
          {label}
        </span>
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

      <div className="tiny muted you-pref-hint" data-testid="kleuren-hint">
        {choice.hint}{' '}
        <details className="you-why">
          <summary>{why}</summary>
          <span className="you-why-body">{note}</span>
        </details>
      </div>

      {state.error && <p className="error-note">{state.error}</p>}
    </form>
  );
}
