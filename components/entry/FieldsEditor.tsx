'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import type { FieldDef } from '@/lib/db/schema';
import { EntryPicker, type EntryRef } from './EntryPicker';

type Values = Record<string, unknown>;

function asEntryRef(value: unknown): EntryRef | null {
  if (value && typeof value === 'object' && 'id' in value && 'name' in value) {
    return value as EntryRef;
  }
  return null;
}

function asEntryRefs(value: unknown): EntryRef[] {
  return Array.isArray(value) ? (value.filter(Boolean) as EntryRef[]) : [];
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

/** Renders the Keeper-configured fields for this entry type (§5). */
export function FieldsEditor({
  fields,
  values,
  onChange,
  readOnly = false,
  hideLabels = false,
  compact = false,
}: {
  fields: FieldDef[];
  values: Values;
  onChange: (patch: Values) => void;
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
  if (!fields.length) return null;

  return (
    <div className={compact ? 'stack fields-compact' : 'stack'}>
      {fields.map((field) => {
        const value = values[field.key];
        const set = (next: unknown) => onChange({ [field.key]: next });

        return (
          <div key={field.key}>
            <label
              className={hideLabels ? 'visually-hidden' : 'label'}
              htmlFor={`field-${field.key}`}
            >
              {field.label}
            </label>

            {field.kind === 'text' && (
              <input
                id={`field-${field.key}`}
                className="input"
                disabled={readOnly}
                defaultValue={typeof value === 'string' ? value : ''}
                onBlur={(event) => set(event.target.value)}
              />
            )}

            {field.kind === 'longtext' && (
              <textarea
                id={`field-${field.key}`}
                className="textarea"
                disabled={readOnly}
                defaultValue={typeof value === 'string' ? value : ''}
                onBlur={(event) => set(event.target.value)}
              />
            )}

            {field.kind === 'date' && (
              <input
                id={`field-${field.key}`}
                className="input"
                type="text"
                inputMode="text"
                placeholder="bijv. 14 oktober 1934"
                disabled={readOnly}
                defaultValue={typeof value === 'string' ? value : ''}
                onBlur={(event) => set(event.target.value)}
              />
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

            {field.kind === 'case_link' && (
              <p className="small muted" style={{ margin: 0 }}>
                Dossierkoppelingen verschijnen zodra de dossiers er zijn (fase 2).
              </p>
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
