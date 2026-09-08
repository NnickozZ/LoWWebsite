'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { LiveField, useLiveFields } from '@/components/live/LiveFields';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';
import type { FieldDef } from '@/lib/db/schema';
import type { CaseRef } from '@/lib/cases/service';
import { caseIdsIn } from '@/lib/entries/caseFields';
import { parseDutchDate } from '@/lib/timelines/time';
import { EntryPicker, type EntryRef } from './EntryPicker';
import { CasePicker } from './CasePicker';
import { MentionRow, MentionText } from '@/components/ui/MentionPopover';

type Values = Record<string, unknown>;

/**
 * §21: dossiers named in a field are stored as bare ids and looked up on the
 * server, per viewer (`resolveCaseRefs`). An id that is not in this map is one
 * the reader may not open, and is left out rather than named.
 */
export type CaseRefs = Record<string, CaseRef>;

function CaseChip({ item }: { item: CaseRef }) {
  return (
    <a className="entry-chip" href={`/c/${item.slug}`} data-case-id={item.id}>
      <Icon name="folder" size={12} />
      {item.name}
    </a>
  );
}

function asEntryRef(value: unknown): EntryRef | null {
  if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
    return value as EntryRef;
  }
  return null;
}

function asEntryRefs(value: unknown): EntryRef[] {
  return Array.isArray(value) ? (value.filter(Boolean) as EntryRef[]) : [];
}

/**
 * §38: a Meerkeuze's value as this editor holds it — the members that are on
 * the Keeper's list, deduped, in the order they were chosen. Deliberately the
 * same rule `coerceFieldValue` applies on the way in: what this writes is
 * exactly what the gate accepts, so a field cannot quietly stop saving.
 */
function asChoices(value: unknown, options: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = options ?? [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.includes(item) || out.includes(item)) continue;
    out.push(item);
  }
  return out;
}

function UserPicker({
  value,
  onChange,
}: {
  value: { id: string; username: string } | null;
  onChange: (next: { id: string; username: string } | null) => void;
}) {
  const [users, setUsers] = useState<{ id: string; username: string; character?: string | null }[]>([]);

  useEffect(() => {
    let alive = true;
    void fetch('/api/users')
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((data) => {
        if (alive) setUsers(data.users ?? []);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <select
      className="select"
      value={value?.id ?? ''}
      onChange={(event) => {
        const found = users.find((u) => u.id === event.target.value);
        onChange(found ? { id: found.id, username: found.username } : null);
      }}
    >
      <option value="">—</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.character ? `${user.username} — speelt ${user.character}` : user.username}
        </option>
      ))}
    </select>
  );
}

/**
 * §21: a string field of the infobox. Inside a `<LiveFields>` room that this
 * person may type in, the text is shared — every keystroke merges with
 * everyone else's and the room saves. Otherwise it is what it was: typed
 * locally, saved on blur.
 */
function StringField({
  id,
  fieldKey,
  className,
  value,
  readOnly,
  placeholder,
  describedBy,
  multiline = false,
  mentions = false,
  onChange,
}: {
  id: string;
  fieldKey: string;
  className: string;
  value: string;
  readOnly: boolean;
  placeholder?: string;
  /** §38: the id of a quiet line under the box, for the date hint. */
  describedBy?: string;
  multiline?: boolean;
  /** §48: offer artikel names on `@`. On the free-text kinds, not on a date. */
  mentions?: boolean;
  onChange: (patch: Values, meta?: { live: boolean }) => void;
}) {
  const room = useLiveFields();
  const shared = Boolean(room?.canEdit);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (!shared) setDraft(value);
  }, [value, shared]);
  const common = {
    id,
    className,
    field: `field.${fieldKey}`,
    disabled: readOnly,
    placeholder,
    'aria-describedby': describedBy,
    value: draft,
    onValue: (next: string, meta: { live: boolean }) => {
      setDraft(next);
      if (meta.live) onChange({ [fieldKey]: next }, { live: true });
    },
    onBlur: () => {
      if (!shared && draft !== value) onChange({ [fieldKey]: draft });
    },
  };
  return (
    <>
      {multiline ? <LiveField as="textarea" mentions={mentions} {...common} /> : <LiveField mentions={mentions} {...common} />}
      {/* §54: the chips of what is in the box, under it and clickable while
          you type. `MentionRow` draws nothing at all when the words name
          nobody, so a tidy infobox with no `[[Naam]]` in it stays tidy — the
          row only ever appears under the one field that earned it. */}
      {mentions && <MentionRow text={draft} />}
    </>
  );
}

/**
 * §38: a Getal.
 *
 * The box holds what is being typed — "-", "1." and "1e" are none of them a
 * number yet — and hands over one value when it is left. An empty box clears
 * the field; a half-typed one puts back what was stored rather than saving
 * rubbish, because the gate would refuse it anyway and the player would be
 * told off for a keystroke.
 *
 * Not shared live, on purpose: the §21 room sweeps `field.*` *strings* out of a
 * Yjs document, and a number is not one. Two people editing the same Getal at
 * once is last-blur-wins, like the keuzelijst beside it.
 */
function NumberField({
  id,
  value,
  readOnly,
  onCommit,
}: {
  id: string;
  value: unknown;
  readOnly: boolean;
  onCommit: (next: number | null) => void;
}) {
  const stored = typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);

  return (
    <input
      id={id}
      className="input"
      type="number"
      disabled={readOnly}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        // A number box reports "1e" and "1." as an empty value with `badInput`
        // set. Clearing the field on that would throw a value away because
        // somebody stopped typing halfway.
        if (event.target.validity?.badInput) {
          setDraft(stored);
          return;
        }
        const typed = draft.trim();
        const next = typed ? Number(typed) : null;
        if (next !== null && !Number.isFinite(next)) {
          setDraft(stored);
          return;
        }
        // `stored` is '' both for an empty field and for a field that was a
        // Tekst until yesterday and still holds a word. Nothing is written in
        // either case unless the number actually changed — which is what keeps
        // a retyped field's old value where it is (§38).
        if (next !== (typeof value === 'number' ? value : null)) onCommit(next);
      }}
    />
  );
}

/**
 * §35 with §38: a hint under a Datum, never a refusal.
 *
 * The archive is set in the 1930s and "ergens in de zomer" is a date somebody
 * means — so the box stays a free text and saves exactly what was typed, which
 * is also what `writeEntryDate` needs it to do. A native date picker would
 * forbid all of that. This only says, quietly and after the box is left, that
 * a tijdlijn will not be able to place what is in it.
 */
function DateHint({ id, value }: { id: string; value: unknown }) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || parseDutchDate(text)) return null;
  return (
    <p id={id} className="tiny muted" style={{ margin: '0.25rem 0 0' }}>
      Dit lezen we niet als datum. Het blijft staan zoals je het typt, maar op een tijdlijn kunnen we
      het zo niet zetten.
    </p>
  );
}

/* -------------------------------------------------------------- reading */

/**
 * §22: one field's value as something to read rather than something to fill
 * in. Returns null when the field is empty, which is what lets the reading
 * infobox leave empty rows out altogether — a wiki's infobox lists the facts
 * that are known, not every fact the template could hold.
 */
export function fieldValue(field: FieldDef, value: unknown, cases: CaseRefs = {}): ReactNode | null {
  switch (field.kind) {
    case 'text':
    case 'longtext':
    case 'date':
    case 'select': {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return null;
      return field.kind === 'longtext' ? (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          <MentionText text={text} />
        </span>
      ) : field.kind === 'text' ? (
        <MentionText text={text} />
      ) : (
        text
      );
    }

    /*
     * §38: a Getal is stored as a number, so it is printed as Dutch reads one —
     * "1.400", not "1400". A field that used to be a Tekst still holds the word
     * somebody typed into it; that is not a number, so the row is simply left
     * out rather than the old value being rewritten.
     */
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      return value.toLocaleString('nl-NL');
    }

    /*
     * §38 with §22: an empty field prints nothing, and "nee" is the empty
     * answer to a Ja/nee. So a `true` makes a row saying "Ja" and a `false`
     * makes no row at all — a fact that is not so is not a fact the infobox
     * lists, the same way an empty Beroep is not listed as "geen beroep". The
     * `false` is still stored, and the checkbox on the writing face still shows
     * it unticked.
     */
    case 'boolean':
      return value === true ? 'Ja' : null;

    /** §38: the same chips a hand-filled list prints, minus the links. */
    case 'multiselect': {
      const chosen = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && Boolean(item))
        : [];
      if (!chosen.length) return null;
      return (
        <span className="row-wrap" style={{ gap: '0.25rem' }}>
          {chosen.map((option) => (
            <span key={option} className="entry-chip" style={{ cursor: 'default' }}>
              {option}
            </span>
          ))}
        </span>
      );
    }

    case 'entry_link': {
      const entry = asEntryRef(value);
      if (!entry) return null;
      return <EntryChip entry={entry} />;
    }

    case 'entry_links': {
      const entries = asEntryRefs(value);
      if (!entries.length) return null;
      return (
        <span className="row-wrap" style={{ gap: '0.25rem' }}>
          {entries.map((entry) => (
            <EntryChip key={entry.id} entry={entry} />
          ))}
        </span>
      );
    }

    case 'user_link': {
      const user = (value as { id?: string; username?: string } | null) ?? null;
      return user?.username ? user.username : null;
    }

    case 'case_link':
    case 'case_links': {
      const items = caseIdsIn(value)
        .map((id) => cases[id])
        .filter(Boolean);
      if (!items.length) return null;
      return (
        <span className="row-wrap" style={{ gap: '0.25rem' }}>
          {items.map((item) => (
            <CaseChip key={item.id} item={item} />
          ))}
        </span>
      );
    }

    // A map pin has no reading shape of its own; the maps a fiche is on are
    // listed under the header instead.
    default:
      return null;
  }
}

function EntryChip({ entry }: { entry: EntryRef }) {
  return (
    <a
      className="entry-chip"
      href={`/e/${entry.slug}`}
      data-entry-id={entry.id}
      style={
        entry.colour
          ? ({ ['--chip-colour' as string]: entry.colour } as React.CSSProperties)
          : undefined
      }
    >
      {entry.name}
    </a>
  );
}

/**
 * §22: the infobox while reading — the same two-column shape the editing one
 * has, so nothing jumps when you switch faces, but every value is text.
 * Renders nothing at all when not one field is filled in.
 */
export function FieldsView({
  fields,
  values,
  cases = {},
}: {
  fields: FieldDef[];
  values: Values;
  cases?: CaseRefs;
}) {
  const rows = fields.flatMap((field) => {
    const shown = fieldValue(field, values[field.key], cases);
    return shown === null ? [] : [{ field, shown }];
  });
  if (!rows.length) return null;

  return (
    <div className="stack fields-compact fields-view">
      {rows.map(({ field, shown }) => (
        <div key={field.key}>
          <span className="label">{field.label}</span>
          <div className="field-value">{shown}</div>
        </div>
      ))}
    </div>
  );
}

/** Renders the Keeper-configured fields for this entry type (§5). */
export function FieldsEditor({
  fields,
  values,
  onChange,
  readOnly: locked = false,
  hideLabels = false,
  compact = false,
  cases = {},
  onCasePicked,
}: {
  fields: FieldDef[];
  values: Values;
  /** §21: the dossiers behind the stored ids, already filtered for this viewer. */
  cases?: CaseRefs;
  /** A dossier just picked here is not in `cases` yet; the page adds it. */
  onCasePicked?: (item: CaseRef) => void;
  /** `meta.live` says the room already saved this; the parent then skips its own save. */
  onChange: (patch: Values, meta?: { live: boolean }) => void;
  readOnly?: boolean;
  /** The infobox shape: label beside value, smaller controls — for a sidebar. */
  compact?: boolean;
  /**
   * §11: a hand-filled list block already has its own heading, so it borrows
   * this editor for one synthetic field and turns the label off rather than
   * printing the name twice.
   */
  hideLabels?: boolean;
}) {
  /*
   * §18b: without an onderzoeker there is no name to file a change under, so
   * every box in the infobox is a printed fact rather than a field — and the
   * first touch of anyone who has not yet chosen asks who they are writing as.
   */
  const mayType = useMayType();
  const gate = useAuthorGate();
  const readOnly = locked || !mayType;

  if (!fields.length) return null;

  return (
    <div className={compact ? 'stack fields-compact' : 'stack'} {...gate}>
      {fields.map((field) => {
        const value = values[field.key];
        const set = (next: unknown) => onChange({ [field.key]: next });
        /*
         * §38: a Meerkeuze is not one control but a row of them, and `htmlFor`
         * may only name something labelable — so it gets a heading and a
         * `role="group"` that points back at it, rather than a `<label>` for a
         * control that does not exist.
         */
        const grouped = field.kind === 'multiselect';
        const labelId = `field-${field.key}-label`;

        return (
          <div key={field.key}>
            {grouped ? (
              <span className={hideLabels ? 'visually-hidden' : 'label'} id={labelId}>
                {field.label}
              </span>
            ) : (
              <label
                className={hideLabels ? 'visually-hidden' : 'label'}
                htmlFor={`field-${field.key}`}
              >
                {field.label}
              </label>
            )}

            {/* §48: `@` in the infobox's own words. The reading face has
                printed chips in these two kinds since round 21; this is the
                offer that makes one without typing the name from memory. */}
            {field.kind === 'text' && (
              <StringField
                id={`field-${field.key}`}
                fieldKey={field.key}
                className="input"
                readOnly={readOnly}
                mentions
                value={typeof value === 'string' ? value : ''}
                onChange={onChange}
              />
            )}

            {field.kind === 'longtext' && (
              <StringField
                id={`field-${field.key}`}
                fieldKey={field.key}
                className="textarea"
                readOnly={readOnly}
                multiline
                mentions
                value={typeof value === 'string' ? value : ''}
                onChange={onChange}
              />
            )}

            {field.kind === 'date' && (
              <>
                <StringField
                  id={`field-${field.key}`}
                  fieldKey={field.key}
                  className="input"
                  placeholder="bijv. 14 oktober 1934"
                  readOnly={readOnly}
                  describedBy={`field-${field.key}-hint`}
                  value={typeof value === 'string' ? value : ''}
                  onChange={onChange}
                />
                <DateHint id={`field-${field.key}-hint`} value={value} />
              </>
            )}

            {field.kind === 'number' && (
              <NumberField
                id={`field-${field.key}`}
                value={value}
                readOnly={readOnly}
                onCommit={(next) => set(next)}
              />
            )}

            {/* §38: the box is the control, so the tick is the whole answer. */}
            {field.kind === 'boolean' && (
              <div>
                <input
                  id={`field-${field.key}`}
                  type="checkbox"
                  disabled={readOnly}
                  checked={value === true}
                  onChange={(event) => set(event.target.checked)}
                />
              </div>
            )}

            {field.kind === 'select' && (
              <select
                id={`field-${field.key}`}
                className="select"
                disabled={readOnly}
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => set(event.target.value)}
              >
                <option value="">—</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {/*
              §38: one checkbox per option the Keeper wrote, and nothing else —
              the list is the Keeper's, exactly as a Keuzelijst's is. The order
              stored is the order they are ticked in.
            */}
            {field.kind === 'multiselect' && (
              <div className="row-wrap" role="group" aria-labelledby={labelId}>
                {(field.options ?? []).map((option) => (
                  <label key={option} className="row small" style={{ gap: '0.35rem' }}>
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={asChoices(value, field.options).includes(option)}
                      onChange={(event) => {
                        const chosen = asChoices(value, field.options);
                        set(
                          event.target.checked
                            ? [...chosen, option]
                            : chosen.filter((item) => item !== option),
                        );
                      }}
                    />
                    {option}
                  </label>
                ))}
                {!(field.options ?? []).length && (
                  <span className="tiny muted">Deze soort heeft hier nog geen keuzes voor.</span>
                )}
              </div>
            )}

            {field.kind === 'entry_link' && (
              <EntryPicker
                value={asEntryRef(value)}
                ofType={field.ofType}
                onPick={(entry) => set(entry)}
                onClear={() => set(null)}
              />
            )}

            {field.kind === 'entry_links' && (
              <div className="stack" style={{ gap: '0.4rem' }}>
                <div className="row-wrap">
                  {asEntryRefs(value).map((entry) => (
                    <span key={entry.id} className="row" style={{ gap: '0.2rem' }}>
                      <a
                        className="entry-chip"
                        href={`/e/${entry.slug}`}
                        data-entry-id={entry.id}
                        style={
                          entry.colour
                            ? ({ ['--chip-colour' as string]: entry.colour } as React.CSSProperties)
                            : undefined
                        }
                      >
                        {entry.name}
                      </a>
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          aria-label={`${entry.name} verwijderen`}
                          onClick={() =>
                            set(asEntryRefs(value).filter((item) => item.id !== entry.id))
                          }
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!readOnly && (
                  <EntryPicker
                    value={null}
                    ofType={field.ofType}
                    placeholder="Nog een toevoegen…"
                    onPick={(entry) => {
                      const current = asEntryRefs(value);
                      if (current.some((item) => item.id === entry.id)) return;
                      set([...current, entry]);
                    }}
                    onClear={() => undefined}
                  />
                )}
              </div>
            )}

            {field.kind === 'user_link' && (
              <UserPicker
                value={(value as { id: string; username: string } | null) ?? null}
                onChange={(next) => set(next)}
              />
            )}

            {(field.kind === 'case_link' || field.kind === 'case_links') && (
              <CasePicker
                id={`field-${field.key}`}
                multiple={field.kind === 'case_links'}
                ids={caseIdsIn(value)}
                cases={cases}
                readOnly={readOnly}
                onPicked={onCasePicked}
                onChange={(ids) =>
                  set(
                    field.kind === 'case_links'
                      ? ids.map((id) => ({ id }))
                      : ids.length
                        ? { id: ids[0] }
                        : null,
                  )
                }
              />
            )}

            {field.kind === 'map_pin' && (
              <p className="small muted" style={{ margin: 0 }}>
                Spelden staan tegenwoordig op de landkaarten zelf: zet dit artikel op een kaart via
                &lsquo;Op de landkaart&rsquo; bovenaan de pagina, of vanaf de{' '}
                <a href="/maps">kaartenpagina</a>.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
