'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/diff';
import { destroyAction, restoreAction, type AdminState } from './actions';

export type TrashRowItem = {
  id: string;
  kind: 'entry' | 'case' | 'board' | 'map' | 'timeline';
  kindLabel: string;
  name: string;
  detail: string;
  deletedAt: number;
  /** What else goes when this goes, counted on the server. */
  effects: { label: string; count: number }[];
};

/**
 * One line in the bin: put it back, or take it off the shelf for good.
 *
 * Restoring is one click, because it undoes something. Destroying is folded
 * away behind a second click and then a third act — typing the name — because
 * it is the only thing in the archive that cannot be undone, and because the
 * two buttons would otherwise sit a centimetre apart. What will go with it is
 * listed *before* the box to type in, not after: the point of the delay is to
 * be read.
 */
export function TrashRow({ item }: { item: TrashRowItem }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, destroy, pending] = useActionState<AdminState, FormData>(destroyAction, {});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // The row is gone from the server's list once it is destroyed, so this only
  // has to hold for the moment before the page comes back.
  const done = Boolean(state.ok);

  return (
    <li style={{ borderBottom: '1px solid var(--rule)', padding: '0.5rem 0' }}>
      <div className="row">
        <span className="chip">{item.kindLabel}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong>{item.name}</strong>
          {item.detail && (
            <span className="tiny muted clamp-2" style={{ display: 'block' }}>
              {item.detail}
            </span>
          )}
        </span>
        <span className="tiny muted">{relativeTime(item.deletedAt)}</span>

        {!done && (
          <>
            <form action={restoreAction}>
              <input type="hidden" name="kind" value={item.kind} />
              <input type="hidden" name="id" value={item.id} />
              <button className="btn btn-small" type="submit">
                Terugzetten
              </button>
            </form>

            <button
              type="button"
              className="btn btn-small btn-ghost"
              aria-expanded={open}
              onClick={() => {
                setOpen((was) => !was);
                setTyped('');
              }}
              title="Voorgoed uit het archief wissen"
            >
              <Icon name="trash" size={14} />
              Definitief wissen
            </button>
          </>
        )}
      </div>

      {done && (
        <p className="small" style={{ margin: '0.4rem 0 0.2rem' }}>
          {state.ok}
        </p>
      )}

      {open && !done && (
        <form
          action={destroy}
          className="stack"
          style={{
            gap: '0.5rem',
            margin: '0.6rem 0 0.4rem',
            border: '1px solid var(--stamp-red)',
            padding: '0.7rem',
          }}
        >
          <input type="hidden" name="kind" value={item.kind} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="name" value={item.name} />

          <p className="small" style={{ margin: 0 }}>
            <strong>{item.name}</strong> wordt voorgoed uit het archief gehaald. Dit kan niet
            teruggedraaid worden — ook niet door een Keeper.
          </p>

          {item.effects.length > 0 && (
            <ul className="tiny muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {item.effects.map((effect) => (
                <li key={effect.label}>
                  {effect.count} {effect.label}
                </li>
              ))}
            </ul>
          )}

          <p className="tiny muted" style={{ margin: 0 }}>
            Afbeeldingen blijven in het archief staan: één foto kan op meer pagina&rsquo;s hangen.
          </p>

          <label className="label" htmlFor={`destroy-${item.kind}-${item.id}`}>
            Typ <strong>{item.name}</strong> over om te bevestigen
          </label>
          <input
            id={`destroy-${item.kind}-${item.id}`}
            ref={inputRef}
            className="input"
            name="confirmName"
            value={typed}
            autoComplete="off"
            placeholder={item.name}
            onChange={(event) => setTyped(event.target.value)}
          />

          {state.error && <p className="error-note">{state.error}</p>}

          <div className="row-wrap">
            <button
              className="btn btn-small btn-danger"
              type="submit"
              disabled={pending || !typed.trim()}
            >
              {pending ? 'Bezig…' : 'Voorgoed wissen'}
            </button>
            <button
              className="btn btn-small btn-ghost"
              type="button"
              onClick={() => setOpen(false)}
            >
              Annuleren
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
