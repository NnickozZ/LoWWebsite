'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import { DEFAULT_WORDS, WORD_GROUPS, type Words } from '@/lib/words';
import { saveWordsAction, type AdminState } from '@/app/(app)/admin/actions';

/**
 * §11's Woorden pane.
 *
 * One box per term the interface repeats, filled with the Keeper's word or left
 * empty with the default as its placeholder. Empty means "use the default", so
 * clearing a box is how you undo one — there is no separate reset per row, and
 * nothing is stored that merely agrees with the default.
 *
 * The list itself lives in `lib/words.ts`. Adding a term there puts it on this
 * screen; nothing here needs to know what the words are for.
 */
export function WordsForm({ overrides }: { overrides: Words }) {
  const [state, action, busy] = useActionState<AdminState, FormData>(saveWordsAction, {});
  const [values, setValues] = useState<Words>(overrides);

  const changed = Object.entries(values).filter(
    ([key, value]) => value.trim() && value.trim() !== DEFAULT_WORDS[key],
  ).length;

  return (
    <form action={action} className="stack">
      <p className="small muted" style={{ maxWidth: '46rem' }}>
        Elk woord dat het archief steeds herhaalt staat hier één keer. Laat een vakje leeg om het
        standaardwoord te gebruiken — dat staat er lichtgrijs in voor. Leegmaken is dus ook hoe je
        een woord terugdraait.
      </p>

      {WORD_GROUPS.map((group) => (
        <section key={group.title} style={{ marginTop: '0.6rem' }}>
          <h3 style={{ margin: '0 0 0.15rem' }}>{group.title}</h3>
          {group.note && (
            <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
              {group.note}
            </p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {group.words.map((def) => {
              const value = values[def.key] ?? '';
              const isChanged = Boolean(value.trim()) && value.trim() !== def.fallback;
              return (
                <li key={def.key} className="admin-word-row">
                  <span style={{ flex: '1 1 13rem', minWidth: 0 }}>
                    <label className="label" htmlFor={`word-${def.key}`}>
                      {def.what}
                    </label>
                    {def.hint && (
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {def.hint}
                      </span>
                    )}
                  </span>
                  <input
                    id={`word-${def.key}`}
                    className="input"
                    name={`word:${def.key}`}
                    value={value}
                    placeholder={def.fallback}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [def.key]: event.target.value }))
                    }
                    style={{ flex: '1 1 12rem', minWidth: 0 }}
                  />
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    aria-label={`${def.what} terug op ${def.fallback}`}
                    title={`Terug op ‘${def.fallback}’`}
                    disabled={!isChanged}
                    style={{ visibility: isChanged ? 'visible' : 'hidden' }}
                    onClick={() =>
                      setValues((current) => ({ ...current, [def.key]: '' }))
                    }
                  >
                    <Icon name="close" size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {state.error && <p className="error-note">{state.error}</p>}
      {state.ok && <p className="small muted">{state.ok}</p>}

      <div className="row-wrap" style={{ marginTop: '0.6rem' }}>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
        <span className="tiny muted">
          {changed
            ? `${changed} ${changed === 1 ? 'woord wijkt' : 'woorden wijken'} af van de standaard.`
            : 'Alles staat op de standaardwoorden.'}
        </span>
      </div>
    </form>
  );
}
