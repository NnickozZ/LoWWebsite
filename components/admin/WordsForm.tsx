'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { normalise } from '@/lib/search/fuzzy';
import {
  DEFAULT_WORDS,
  WORD_DEFS,
  WORD_GROUPS,
  WORD_MAX,
  fill,
  type WordDef,
  type WordGroup,
  type Words,
} from '@/lib/words';
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
 *
 * §96 (ronde 57): één woord vinden zonder 12.500 px te scrollen.
 *
 * Drie dingen, en de server action is er niet één van — die bleef precies wat
 * hij was:
 *
 *   1. **een zoekvak bovenaan.** Het filtert op wat een woord doet, wat het
 *      standaard zegt, de hint en wat de Keeper er zelf van maakte;
 *   2. **de groepen staan ingeklapt**, met naast de kop hoeveel woorden erin
 *      afwijken. Zoeken klapt open wat past;
 *   3. **een plakkende voet** met *Opslaan* en wat er nog niet bewaard is.
 *
 * Waarom een voet en geen autosave per vak: `saveWords` schrijft de héle lijst
 * in één keer (`cleanWordOverrides` op wat het formulier post), dus een vak dat
 * zichzelf opslaat moet óf alle vakken meesturen óf een tweede schrijfweg
 * krijgen die één sleutel samenvoegt. Het eerste is dezelfde knop met een
 * timer ervoor, het tweede is een tweede weg naast een bestaande (§5). Een
 * voet die altijd in beeld is, lost de wrijving op — twaalfduizend pixels naar
 * de knop — zonder aan het schrijven te komen, en drie specs drukken hem al.
 *
 * **Alles blijft in het formulier.** Een ingeklapte groep en een weggefilterd
 * woord zijn `hidden`, niet weg: het formulier post elk vak, en `saveWords`
 * vervangt de hele rij. Een vak dat niet gerenderd werd, zou bij het opslaan
 * stil zijn woord verliezen.
 */
export function WordsForm({ overrides }: { overrides: Words }) {
  const ui = useUi();
  const [state, action, busy] = useActionState<AdminState, FormData>(saveWordsAction, {});
  const [values, setValues] = useState<Words>(overrides);
  const [saved, setSaved] = useState<Words>(overrides);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const posted = useRef<Words>(overrides);

  // What the last successful save stored is the new baseline for "niet opgeslagen".
  useEffect(() => {
    if (state.ok) setSaved(posted.current);
  }, [state]);

  const changed = Object.entries(values).filter(
    ([key, value]) => value.trim() && value.trim() !== DEFAULT_WORDS[key],
  ).length;

  const effective = (words: Words, key: string) => {
    const value = (words[key] ?? '').trim();
    return value === DEFAULT_WORDS[key] ? '' : value;
  };
  const dirty = WORD_DEFS.filter((def) => effective(values, def.key) !== effective(saved, def.key)).length;

  const needle = normalise(filter);
  const matches = (def: WordDef, group: WordGroup) =>
    !needle ||
    [def.what, def.fallback, def.hint ?? '', values[def.key] ?? '', def.key, group.title].some((text) =>
      normalise(text).includes(needle),
    );
  let shown = 0;

  return (
    <form
      action={action}
      className="stack admin-words"
      onSubmit={() => {
        posted.current = values;
      }}
    >
      <p className="small muted" style={{ maxWidth: '46rem' }}>
        Elk woord dat het archief steeds herhaalt staat hier één keer. Laat een vakje leeg om het
        standaardwoord te gebruiken — dat staat er lichtgrijs in voor. Leegmaken is dus ook hoe je
        een woord terugdraait.
      </p>

      <input
        type="search"
        className="input admin-words-filter"
        value={filter}
        placeholder={ui.words.wordsFilter}
        aria-label={ui.words.wordsFilter}
        data-testid="words-filter"
        onChange={(event) => setFilter(event.target.value)}
        // Enter in the filter must not post the whole list.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.preventDefault();
        }}
        autoComplete="off"
      />

      {WORD_GROUPS.map((group) => {
        const groupChanged = group.words.filter((def) => effective(values, def.key)).length;
        const hits = group.words.filter((def) => matches(def, group));
        shown += hits.length;
        const isOpen = needle ? hits.length > 0 : open.has(group.title);
        const bodyId = `words-group-${group.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
        return (
          <section
            key={group.title}
            className="admin-words-group"
            hidden={Boolean(needle) && hits.length === 0}
            data-testid="words-group"
          >
            <h3 style={{ margin: 0 }}>
              <button
                type="button"
                className="admin-words-toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (next.has(group.title)) next.delete(group.title);
                    else next.add(group.title);
                    return next;
                  })
                }
              >
                <Icon name="chevron" size={14} className="admin-words-chevron" />
                <span>{group.title}</span>
                {groupChanged > 0 && (
                  <span className="tiny muted admin-words-count">
                    {fill(ui.words.wordsChanged, { n: String(groupChanged) })}
                  </span>
                )}
              </button>
            </h3>
            <div id={bodyId} hidden={!isOpen}>
              {group.note && (
                <p className="tiny muted" style={{ margin: '0.2rem 0 0.5rem' }}>
                  {group.note}
                </p>
              )}

              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {group.words.map((def) => {
                  const value = values[def.key] ?? '';
                  const isChanged = Boolean(value.trim()) && value.trim() !== def.fallback;
                  return (
                    <li key={def.key} className="admin-word-row" hidden={!matches(def, group)}>
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
                        maxLength={WORD_MAX}
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
                        onClick={() => setValues((current) => ({ ...current, [def.key]: '' }))}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}

      {needle && shown === 0 && <p className="small muted">{ui.words.wordsNoMatch}</p>}

      <div className="admin-sticky-foot" data-testid="words-foot">
        <span className="tiny muted" aria-live="polite">
          {dirty > 0 && (
            <strong className="admin-words-dirty">{fill(ui.words.wordsDirty, { n: String(dirty) })} · </strong>
          )}
          {changed
            ? `${changed} ${changed === 1 ? 'woord wijkt' : 'woorden wijken'} af van de standaard.`
            : 'Alles staat op de standaardwoorden.'}
          {state.error && <>{' '}<span className="error-note">{state.error}</span></>}
          {state.ok && !dirty && <>{' '}<span>{state.ok}</span></>}
        </span>
        <button className="btn btn-primary btn-small" type="submit" disabled={busy}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
    </form>
  );
}
