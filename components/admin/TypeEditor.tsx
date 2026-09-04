'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/Icon';
import { BORDER_OPTIONS } from '@/components/borders';
import { PageBlocksEditor, type TypeLite } from '@/components/admin/PageBlocksEditor';
import { FIELD_KINDS } from '@/lib/fieldKinds';
import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_DESCRIPTION_PLACEHOLDER,
  type PageBlock,
  type TypeText,
} from '@/lib/pageBlocks';
import type { Words } from '@/lib/words';
import type { FieldDef, FieldKind } from '@/lib/db/schema';
import { saveTypeAction, deleteTypeAction, type AdminState } from '@/app/(app)/admin/actions';

const ICONS = [
  'person',
  'badge',
  'pin',
  'box',
  'magnifier',
  'eye',
  'flag',
  'calendar',
  'book',
  'notebook',
  'file',
  'folder',
  'board',
  'clock',
  'shield',
  'lock',
];

/**
 * §11: rename a type, change its icon, colour and card border, add, rename,
 * retype or reorder its fields — and, since the page builder, decide what a
 * fiche of this soort actually *is*: which blocks its page has, in what order,
 * and what the handful of shared sentences say on it.
 *
 * Existing entries keep whatever they had. A field that goes away leaves its
 * value in the JSON, so putting it back brings the value back with it, and the
 * same is true of a hand-filled list: its values are filed under the block's
 * own key, which is assigned once and never changes when the heading does.
 */
export function TypeEditor({
  type,
  types,
  words,
}: {
  type: {
    id: string;
    slug: string;
    label: string;
    icon: string;
    colour: string;
    border: string;
    fields: FieldDef[];
    blocks: PageBlock[];
    pageText: TypeText;
    entryCount: number;
  };
  /** Every soort, so a self-filling list can offer their fields by name. */
  types: TypeLite[];
  words: Words;
}) {
  const [save, saveAction, saving] = useActionState<AdminState, FormData>(saveTypeAction, {});
  const [remove, removeAction] = useActionState<AdminState, FormData>(deleteTypeAction, {});
  const [fields, setFields] = useState<FieldDef[]>(type.fields);
  const [blocks, setBlocks] = useState<PageBlock[]>(type.blocks);
  const [pageText, setPageText] = useState<TypeText>(type.pageText);
  const [icon, setIcon] = useState(type.icon);
  const [colour, setColour] = useState(type.colour);

  function patchField(index: number, patch: Partial<FieldDef>) {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  function move(index: number, by: number) {
    setFields((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <details className="section admin-type">
      <summary>
        <Icon name={icon} size={15} style={{ color: colour }} />
        {type.label}
        <span className="muted tiny" style={{ marginLeft: '0.4rem' }}>
          {type.entryCount} {type.entryCount === 1 ? 'fiche' : 'fiches'}
        </span>
      </summary>

      <form action={saveAction} className="stack" style={{ padding: '0.7rem 0 1rem' }}>
        <input type="hidden" name="typeId" value={type.id} />
        <input type="hidden" name="fields" value={JSON.stringify(fields)} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <input type="hidden" name="pageText" value={JSON.stringify(pageText)} />

        <div className="row-wrap">
          <span style={{ flex: '1 1 12rem' }}>
            <label className="label" htmlFor={`label-${type.id}`}>
              Naam
            </label>
            <input
              id={`label-${type.id}`}
              className="input"
              name="label"
              defaultValue={type.label}
            />
          </span>
          <span>
            <label className="label" htmlFor={`colour-${type.id}`}>
              Kleur
            </label>
            <input
              id={`colour-${type.id}`}
              className="input"
              name="colour"
              type="color"
              value={colour}
              onChange={(event) => setColour(event.target.value)}
              style={{ width: 72, padding: '0.2rem' }}
            />
          </span>
          <span style={{ flex: '1 1 10rem' }}>
            <label className="label" htmlFor={`border-${type.id}`}>
              Rand van de kaart
            </label>
            <select
              id={`border-${type.id}`}
              className="select"
              name="border"
              defaultValue={type.border}
            >
              {BORDER_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        </div>

        <div>
          <span className="label">Pictogram</span>
          <input type="hidden" name="icon" value={icon} />
          <div className="row-wrap">
            {ICONS.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={icon === name}
                className={`chip chip-selectable${icon === name ? ' chip-active' : ''}`}
                onClick={() => setIcon(name)}
              >
                <Icon name={name} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="label">Velden</span>
          {!fields.length && (
            <p className="tiny muted" style={{ margin: 0 }}>
              Deze soort heeft geen extra velden. Dat mag.
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {fields.map((field, index) => (
              <li key={`${field.key}-${index}`} className="admin-field-row">
                <input
                  className="input"
                  aria-label={`Naam van veld ${index + 1}`}
                  value={field.label}
                  onChange={(event) => patchField(index, { label: event.target.value })}
                  style={{ flex: '1 1 8rem', minHeight: 38 }}
                />
                <select
                  className="select"
                  aria-label={`Soort van veld ${index + 1}`}
                  value={field.kind}
                  onChange={(event) =>
                    patchField(index, { kind: event.target.value as FieldKind })
                  }
                  style={{ flex: '0 1 12rem', minHeight: 38 }}
                >
                  {FIELD_KINDS.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {field.kind === 'select' && (
                  <input
                    className="input"
                    aria-label={`Keuzes van veld ${index + 1}`}
                    placeholder="keuzes, met komma's"
                    value={(field.options ?? []).join(', ')}
                    onChange={(event) =>
                      patchField(index, {
                        options: event.target.value.split(',').map((option) => option.trim()),
                      })
                    }
                    style={{ flex: '1 1 8rem', minHeight: 38 }}
                  />
                )}
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} omhoog`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} omlaag`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  aria-label={`Veld ${index + 1} verwijderen`}
                  onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-small"
            style={{ marginTop: '0.4rem' }}
            onClick={() =>
              setFields((current) => [
                ...current,
                { key: `veld_${current.length + 1}`, label: '', kind: 'text' },
              ])
            }
          >
            <Icon name="plus" size={15} />
            Veld toevoegen
          </button>
        </div>

        <PageBlocksEditor
          blocks={blocks}
          onChange={setBlocks}
          types={types}
          words={words}
          idPrefix={`blk-${type.id}`}
        />

        <div>
          <span className="label">De woorden van deze soort</span>
          <p className="tiny muted" style={{ margin: '0 0 0.45rem' }}>
            Een locatie vraagt iets anders dan een personage. Laat leeg voor de vraag die overal
            staat.
          </p>
          <div className="stack" style={{ gap: '0.45rem' }}>
            <span>
              <label className="tiny muted" htmlFor={`txt-desc-${type.id}`}>
                De vraag onder de titel
              </label>
              <textarea
                id={`txt-desc-${type.id}`}
                className="textarea"
                rows={2}
                value={pageText.descriptionPlaceholder ?? ''}
                placeholder={DEFAULT_DESCRIPTION_PLACEHOLDER}
                onChange={(event) =>
                  setPageText((current) => ({
                    ...current,
                    descriptionPlaceholder: event.target.value,
                  }))
                }
              />
            </span>
            <span>
              <label className="tiny muted" htmlFor={`txt-body-${type.id}`}>
                De regel in het grote tekstvak
              </label>
              <input
                id={`txt-body-${type.id}`}
                className="input"
                value={pageText.bodyPlaceholder ?? ''}
                placeholder={DEFAULT_BODY_PLACEHOLDER}
                onChange={(event) =>
                  setPageText((current) => ({ ...current, bodyPlaceholder: event.target.value }))
                }
              />
            </span>
            <div className="row-wrap">
              <span style={{ flex: '1 1 10rem' }}>
                <label className="tiny muted" htmlFor={`txt-new-${type.id}`}>
                  Wat de knop ‘nieuw’ zegt
                </label>
                <input
                  id={`txt-new-${type.id}`}
                  className="input"
                  value={pageText.newButton ?? ''}
                  placeholder={words.newOfType ?? 'Nieuw'}
                  onChange={(event) =>
                    setPageText((current) => ({ ...current, newButton: event.target.value }))
                  }
                />
              </span>
              <span style={{ flex: '1 1 14rem' }}>
                <label className="tiny muted" htmlFor={`txt-noback-${type.id}`}>
                  Wat er staat als niets hiernaar verwijst
                </label>
                <input
                  id={`txt-noback-${type.id}`}
                  className="input"
                  value={pageText.noBacklinks ?? ''}
                  placeholder="Nog niets verwijst hiernaar."
                  onChange={(event) =>
                    setPageText((current) => ({ ...current, noBacklinks: event.target.value }))
                  }
                />
              </span>
            </div>
          </div>
        </div>

        {save.error && <p className="error-note">{save.error}</p>}
        {save.ok && <p className="small muted">{save.ok}</p>}

        <div className="row-wrap">
          <button className="btn btn-small btn-primary" type="submit" disabled={saving}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          <div className="spacer" />
          {type.entryCount === 0 && (
            <button className="btn btn-small btn-danger" type="submit" formAction={removeAction}>
              <Icon name="trash" size={14} />
              Soort verwijderen
            </button>
          )}
        </div>
        {remove.error && <p className="error-note">{remove.error}</p>}
      </form>
    </details>
  );
}
