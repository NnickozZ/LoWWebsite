'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  READING_FONT_CHOICES,
  readingFontStack,
  type ReadingFont,
} from '@/lib/readingFont';
import { setReadingFontAction, type ReadingFontState } from './actions';

/**
 * §29: the letter this person reads the archive in.
 *
 * Three submit chips, no Save button, because the choice *is* the action.
 * (This shape was shared with "Lezen of bewerken", the §22 setting retired in
 * round 13.) One addition it cannot do without: the hint under the chips is
 * printed in the letter it
 * describes, and it follows the chip under the pointer or the keyboard focus
 * rather than only the chip that is on. Somebody deciding whether OpenDyslexic
 * helps them has to be able to read a sentence of it *first*; a font setting
 * you must commit to before you can see it is a font setting nobody changes.
 *
 * The chosen face lands on the whole archive by way of the signed-in layout,
 * which reads it off the session, so this page changes with everything else
 * the moment the action returns.
 */
export function ReadingFontForm({ current }: { current: ReadingFont }) {
  const [state, action, pending] = useActionState<ReadingFontState, FormData>(
    setReadingFontAction,
    {},
  );
  const [preview, setPreview] = useState<ReadingFont | null>(null);
  const chosen = state.font ?? current;
  // What the sample is set in: the chip being pointed at, or the one in force.
  const showing = preview ?? chosen;
  const choice =
    READING_FONT_CHOICES.find((item) => item.value === showing) ?? READING_FONT_CHOICES[0];

  return (
    <form action={action}>
      <div className="row-wrap" role="group" aria-label="Lettertype om in te lezen">
        {READING_FONT_CHOICES.map((item) => {
          const on = item.value === chosen;
          return (
            <button
              key={item.value || 'archive'}
              type="submit"
              name="font"
              value={item.value}
              disabled={pending}
              aria-pressed={on}
              className={`chip chip-selectable${on ? ' chip-active' : ''}`}
              // Each chip is set in its own letter, so the row itself is a
              // specimen sheet — you can see the difference before you press.
              style={{ fontFamily: readingFontStack(item.value) }}
              onPointerEnter={() => setPreview(item.value)}
              onPointerLeave={() => setPreview(null)}
              onFocus={() => setPreview(item.value)}
              onBlur={() => setPreview(null)}
            >
              {on && <Icon name="check" size={13} />}
              {item.label}
            </button>
          );
        })}
      </div>

      <p
        className="small"
        style={{
          margin: '0.55rem 0 0',
          fontFamily: readingFontStack(showing),
          color: showing === chosen ? 'var(--ink-muted)' : 'var(--ink)',
        }}
      >
        {choice.hint}
      </p>

      <p className="tiny muted" style={{ margin: '0.35rem 0 0' }}>
        De stempels, de tabbladen en de letter op een omslag blijven staan — die zijn het archief
        zelf.
      </p>

      {state.error && <p className="error-note">{state.error}</p>}
    </form>
  );
}
