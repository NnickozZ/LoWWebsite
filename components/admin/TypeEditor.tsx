'use client';

import { useActionState, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { slugify } from '@/lib/slug';
import { BORDER_OPTIONS } from '@/components/borders';
import { PageBlocksEditor, type TypeLite } from '@/components/admin/PageBlocksEditor';
import { FIELD_KINDS } from '@/lib/fieldKinds';
import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_DESCRIPTION_PLACEHOLDER,
  type PageBlock,
  type TypeText,
} from '@/lib/pageBlocks';
import { capitalise, type Words } from '@/lib/words';
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
    caseOnly: boolean;
    entryCount: number;
  };
  /** Every soort, so a self-filling list can offer their fields by name. */
  types: TypeLite[];
  words: Words;
}) {
  const ui = useUi();
  const [save, saveAction, saving] = useActionState<AdminState, FormData>(saveTypeAction, {});
  const [remove, removeAction] = useActionState<AdminState, FormData>(deleteTypeAction, {});
  const [label, setLabel] = useState(type.label);
  const [slug, setSlug] = useState(type.slug);
  const [fields, setFields] = useState<FieldDef[]>(type.fields);
  const [blocks, setBlocks] = useState<PageBlock[]>(type.blocks);
  const [pageText, setPageText] = useState<TypeText>(type.pageText);
  const [icon, setIcon] = useState(type.icon);
  const [colour, setColour] = useState(type.colour);
  const [caseOnly, setCaseOnly] = useState(type.caseOnly);

  /*
   * §11: a rename of the *address* is not an ordinary save. It moves every
   * artikel of this soort, and it breaks every `/wiki/<oude-slug>` link and
   * every saved filter URL that names it — so the sheet asks first, and only
   * when the address really changed. `confirmed` is what stops the second,
   * programmatic submit from asking all over again.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const slugChanged = Boolean(slug.trim()) && slugify(slug) !== type.slug;
  // The nudge that fixes Relieken and Voorwerpen: the seed could rename the
  // words but not the addresses, so `object` still sits under "Relieken".
  const suggestion = slugify(label);
  const mismatched = Boolean(label.trim()) && suggestion !== slug;

  async function guardSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    // The delete button submits this same form with its own action; it has
    // nothing to do with the address.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter?.hasAttribute('formaction')) return;
    if (!slugChanged) return;

    event.preventDefault();
    const yes = await ui.confirm({
      title: 'Adres van deze soort wijzigen?',
      message: (
        <>
          <p style={{ margin: '0 0 0.5rem' }}>
            <code>/wiki/{type.slug}</code> wordt <code>/wiki/{slugify(slug)}</code>. Alles in het
            archief verhuist mee: de {words.entryPlural} van deze soort, de velden en de lijsten die
            deze soort noemen.
          </p>
          <p style={{ margin: 0 }}>
            Oude links naar <code>/wiki/{type.slug}</code> en opgeslagen filter-links werken daarna
            niet meer. Die staan buiten het archief, dus die kan het archief niet meeverhuizen.
          </p>
        </>
      ),
      confirmLabel: 'Adres wijzigen',
    });
    if (!yes) return;
    confirmed.current = true;
    formRef.current?.requestSubmit();
  }

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
          {type.entryCount} {type.entryCount === 1 ? 'artikel' : 'artikelen'}
        </span>
      </summary>

      <form
        ref={formRef}
        action={saveAction}
        onSubmit={guardSubmit}
        className="stack"
        style={{ padding: '0.7rem 0 1rem' }}
      >
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
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </span>
          {/* §11: the address, beside the name, because they are one thing said
              twice — and the line under it is the URL it actually makes. */}
          <span style={{ flex: '1 1 12rem' }}>
            <label className="label" htmlFor={`slug-${type.id}`}>
              Adres (slug)
            </label>
            <input
              id={`slug-${type.id}`}
              className="input"
              name="slug"
              value={slug}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(event) => setSlug(event.target.value)}
            />
            <span className="tiny muted" style={{ display: 'block', marginTop: '0.2rem' }}>
              /wiki/{slug.trim() ? slugify(slug) : '…'}
            </span>
            {/*
              The nudge, not the fix: `Relieken` still lives at `object` and
              `Voorwerpen` at `item`, because the seed could rename the words
              and not the addresses. Nothing is renamed on its own — moving
              every artikel of a soort and breaking every old link is a thing a
              person decides. This only says so, and fills in the answer.
            */}
            {mismatched && (
              <span className="tiny" style={{ display: 'block', marginTop: '0.3rem' }}>
                Het adres van deze soort (<code>{slug}</code>) hoort niet meer bij de naam (
                {label.trim()}).{' '}
                <button
                  type="button"
                  className="btn btn-small btn-ghost"
                  onClick={() => setSlug(suggestion)}
                >
                  <Icon name="edit" size={13} />
                  {suggestion} gebruiken
                </button>
              </span>
            )}
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

        {/*
          §24: some soorten only exist inside an investigation. A voorwerp or a
          clue is *found*, so it is made in a dossier; the "Nieuw artikel" sheet
          leaves it out and the wiki's own new button goes away. What is already
          made stays exactly where it is, and still shows up in the wiki.
        */}
        <div>
          <span className="label">Waar wordt dit gemaakt</span>
          <input type="hidden" name="caseOnly" value={caseOnly ? '1' : ''} />
          <div className="row-wrap">
            <button
              type="button"
              aria-pressed={caseOnly}
              className={`chip chip-selectable${caseOnly ? ' chip-active' : ''}`}
              onClick={() => setCaseOnly((was) => !was)}
            >
              <Icon name={caseOnly ? 'folder' : 'file'} size={13} />
              {caseOnly ? `Alleen in een ${words.case}` : 'Overal in het archief'}
            </button>
            <span className="tiny muted" style={{ flex: '1 1 14rem' }}>
              {caseOnly
                ? `Deze soort staat niet in het "${words.newEntry}"-venster en heeft geen eigen knop in de wiki. In de wiki komen ze te staan als "${capitalise(words.case)}: naam".`
                : `Overal aan te maken: via "${words.newEntry}", via de wiki, en in een ${words.case}.`}
            </span>
          </div>
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
            Een locatie vraagt iets anders dan een persoon. Laat leeg voor de vraag die overal
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

        {/*
          §11: plain Dutch, above the save, and always — not only once the
          address has been touched. Somebody about to rename a soort should read
          what it costs before they type, not after.
        */}
        <p className="small muted" style={{ margin: 0, maxWidth: '46rem' }}>
          <strong>Let op bij het adres.</strong> Verander je het adres, dan verhuist alles in het
          archief automatisch mee: de {words.entryPlural} van deze soort, en elk veld en elke lijst
          die deze soort noemt. Wat níet meeverhuist zijn links van buiten:{' '}
          <code>/wiki/{type.slug}</code> en opgeslagen filter-links met dit adres erin werken daarna
          niet meer.
        </p>

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
