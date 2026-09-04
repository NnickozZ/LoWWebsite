'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { AddToCaseButton } from '@/components/cases/AddToCaseButton';
import { PinToBoardButton } from '@/components/boards/PinToBoardButton';
import { RichEditor } from '@/components/editor/RichEditor';
import { useUi } from '@/components/ui/UiProvider';
import {
  DEFAULT_BODY_PLACEHOLDER,
  DEFAULT_DESCRIPTION_PLACEHOLDER,
  defaultBlockTitle,
  type PageBlock,
  type TypeText,
} from '@/lib/pageBlocks';
import type { CoverCrop, FieldDef, Visibility } from '@/lib/db/schema';
import { CoverEditor } from './CoverEditor';
import { FieldsEditor } from './FieldsEditor';
import { RevealPicker, type RevealableCase, type RevealableUser } from './RevealPicker';
import { SectionsEditor, type SectionLite } from './SectionsEditor';
import { TagsEditor } from './TagsEditor';
import { saveLabel, useAutosave } from './useAutosave';

export type EntryViewData = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  body: unknown;
  fields: Record<string, unknown>;
  tags: string[];
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  typeFields: FieldDef[];
  /** §11: what this soort's page is made of, already resolved on the server. */
  typeBlocks: PageBlock[];
  /** This soort's own wording, where it has any. */
  typeText: TypeText;
  visibility: Visibility;
  isLocked: boolean;
  keeperNotes: string;
  /** Keeper only; a player's list is empty because it never left the server. */
  revealedTo: string[];
};

const VISIBILITY_LABELS: Record<Visibility, string> = {
  all: 'Iedereen',
  keeper: 'Alleen de Keeper',
  players: 'Gekozen spelers',
};

type Patch = Record<string, unknown>;

function autosize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

export type EntryCaseLite = { id: string; slug: string; name: string; visibility: 'all' | 'assigned' };

export function EntryView({
  entry,
  knownTags,
  isKeeper,
  openAddMore,
  cases,
  sections,
  revealUsers,
  revealCases,
  slots,
}: {
  entry: EntryViewData;
  knownTags: string[];
  isKeeper: boolean;
  openAddMore: boolean;
  cases: EntryCaseLite[];
  sections: SectionLite[];
  revealUsers: RevealableUser[];
  revealCases: RevealableCase[];
  /**
   * §11. Blocks whose contents are a *read* — the self-filling lists, the
   * backlinks, the history, the delete box — are rendered on the server and
   * handed here by block id, so their queries stay behind
   * `visibleEntryCondition` and never travel to a player's browser as props.
   * This component only decides where on the page each one lands.
   */
  slots: Record<string, ReactNode>;
}) {
  const ui = useUi();
  const router = useRouter();

  const [name, setName] = useState(entry.name);
  const [shortDescription, setShortDescription] = useState(entry.shortDescription);
  const [tags, setTags] = useState(entry.tags);
  const [fields, setFields] = useState(entry.fields);
  const [cover, setCover] = useState({ assetId: entry.coverAssetId, crop: entry.coverCrop });
  const [keeperNotes, setKeeperNotes] = useState(entry.keeperNotes);
  const [visibility, setVisibility] = useState(entry.visibility);
  const [revealedTo, setRevealedTo] = useState(entry.revealedTo);
  const [isLocked, setIsLocked] = useState(entry.isLocked);
  const leadRef = useRef<HTMLTextAreaElement>(null);
  const notifiedFor = useRef<string | null>(null);

  const save = useCallback(
    async (patch: Patch) => {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json();
      if (!response.ok) return { ok: false, error: data.error };
      if (data.status === 'pending') {
        ui.toast('Naar de Keeper gestuurd ter beoordeling.');
        return { ok: true, pending: true };
      }

      // §6: someone else touched this entry between our loads.
      const other = data.previousEditorName as string | null;
      if (other && data.previousEditorIsSomeoneElse && notifiedFor.current !== other) {
        notifiedFor.current = other;
        ui.toast(`${other} heeft dit ook bewerkt — ververst`);
        router.refresh();
      }
      return { ok: true };
    },
    [entry.id, router, ui],
  );

  const { state, set, flush } = useAutosave<Patch>({ save });

  useEffect(() => autosize(leadRef.current), [shortDescription]);

  const words = ui.words;

  /**
   * §11: one block of the page. The five built-ins are drawn here; the ones
   * that are a read of the archive come in through `slots`, already rendered on
   * the server. A block the Keeper hid is simply not drawn — nothing is hidden
   * with CSS, which is the same rule the reveals follow.
   */
  function renderBlock(block: PageBlock): ReactNode {
    if (block.hidden) return null;
    const heading = block.title || defaultBlockTitle(block.kind, words);
    const note = block.note ? (
      <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
        {block.note}
      </p>
    ) : null;

    switch (block.kind) {
      case 'fields':
        return (
          <details key={block.id} className="section" open={block.open || openAddMore}>
            <summary>{heading}</summary>
            <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
              {note}
              {entry.typeFields.length > 0 && (
                <FieldsEditor
                  fields={entry.typeFields}
                  values={fields}
                  onChange={(patch) => {
                    const next = { ...fields, ...patch };
                    setFields(next);
                    set({ fields: patch });
                  }}
                />
              )}
              <div>
                <span className="label">Tags</span>
                <TagsEditor
                  tags={tags}
                  known={knownTags}
                  onChange={(next) => {
                    setTags(next);
                    set({ tags: next });
                  }}
                />
              </div>
            </div>
          </details>
        );

      case 'body':
        return (
          <section key={block.id} style={{ margin: '1.2rem 0' }}>
            {heading && <h2 style={{ marginBottom: '0.3rem' }}>{heading}</h2>}
            {note}
            <RichEditor
              initialDoc={entry.body}
              placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
              onChange={(doc) => set({ body: doc })}
            />
          </section>
        );

      case 'sections':
        return (
          <div key={block.id}>
            {note}
            <SectionsEditor
              entryId={entry.id}
              sections={sections}
              isKeeper={isKeeper}
              users={revealUsers}
              cases={revealCases}
            />
          </div>
        );

      case 'links':
        // The chosen entries live in `entries.fields` under the block's own
        // key, so they save through the ordinary autosave and the picker,
        // chips and remove buttons are the ones a field already has.
        return (
          <details key={block.id} className="section" open={block.open}>
            <summary>{heading || 'Lijst'}</summary>
            <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
              {note}
              <FieldsEditor
                hideLabels
                fields={[
                  {
                    key: block.key ?? block.id,
                    label: heading || 'Lijst',
                    kind: 'entry_links',
                    ofType: block.ofType,
                  },
                ]}
                values={fields}
                onChange={(patch) => {
                  const next = { ...fields, ...patch };
                  setFields(next);
                  set({ fields: patch });
                }}
              />
            </div>
          </details>
        );

      // Everything else is a read, rendered on the server and handed over as a
      // slot. Wrapped in a keyed Fragment rather than trusting the slot to have
      // brought a key of its own: these are the children of one array, and the
      // file that builds them is not the file that lists them, so the invariant
      // belongs here where the array is made.
      default:
        return <Fragment key={block.id}>{slots[block.id] ?? null}</Fragment>;
    }
  }

  return (
    <article className="page">
      <div className="entry-head">
        <CoverEditor
          assetId={cover.assetId}
          crop={cover.crop}
          alt={entry.name}
          icon={entry.typeIcon}
          colour={entry.typeColour}
          onChange={(next) => {
            setCover({ assetId: next.coverAssetId, crop: next.coverCrop });
            set({ coverAssetId: next.coverAssetId, coverCrop: next.coverCrop });
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div className="row-wrap" style={{ marginBottom: '0.4rem' }}>
            <span className="chip" style={{ borderColor: entry.typeColour, color: entry.typeColour }}>
              <Icon name={entry.typeIcon} size={14} />
              {entry.typeLabel}
            </span>
            {isLocked && (
              <span className="chip">
                <Icon name="lock" size={13} />
                Vergrendeld
              </span>
            )}
            {visibility !== 'all' && (
              <span className="stamp">
                {visibility === 'keeper' ? 'Alleen voor de Keeper' : 'Onthuld'}
              </span>
            )}
          </div>

          <label className="visually-hidden" htmlFor="entry-name">
            Naam
          </label>
          <input
            id="entry-name"
            className="title-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              set({ name: event.target.value });
            }}
            onBlur={() => void flush()}
          />

          <label className="visually-hidden" htmlFor="entry-lead">
            Korte beschrijving
          </label>
          <textarea
            id="entry-lead"
            ref={leadRef}
            className="lead-input"
            rows={1}
            placeholder={entry.typeText.descriptionPlaceholder || DEFAULT_DESCRIPTION_PLACEHOLDER}
            value={shortDescription}
            onChange={(event) => {
              setShortDescription(event.target.value);
              autosize(event.target);
              set({ shortDescription: event.target.value });
            }}
            onBlur={() => void flush()}
          />

          <div className="row-wrap" style={{ marginTop: '0.3rem' }}>
            {tags.map((tag) => (
              <a key={tag} className="tag" href={`/wiki?tag=${encodeURIComponent(tag)}`}>
                {tag}
              </a>
            ))}
          </div>

          <div className="row-wrap" style={{ marginTop: '0.7rem' }}>
            <AddToCaseButton
              entryId={entry.id}
              entryName={entry.name}
              inCaseIds={cases.map((item) => item.id)}
            />
            <PinToBoardButton entryId={entry.id} entryName={entry.name} />
          </div>

          {cases.length > 0 && (
            <p className="row-wrap tiny" style={{ marginTop: '0.5rem', gap: '0.3rem' }}>
              <span className="muted">In:</span>
              {cases.map((item) => (
                <Link key={item.id} className="chip" href={`/c/${item.slug}`}>
                  <Icon name="folder" size={12} />
                  {item.name}
                  {item.visibility === 'assigned' && <Icon name="lock" size={11} />}
                </Link>
              ))}
            </p>
          )}

          <p className="save-state" aria-live="polite" style={{ marginTop: '0.5rem' }}>
            {saveLabel(state)}
          </p>
        </div>
      </div>

      {entry.typeBlocks.map((block) => renderBlock(block))}

      {isKeeper && (
        <>
          <details className="section">
            <summary>
              <Icon name="eye" size={14} /> {words.visibilityAndReveals}
            </summary>
            <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
              <div>
                <span className="label">Wie mag {`deze ${words.entry}`} zien</span>
                <div className="row-wrap">
                  {(['all', 'players', 'keeper'] as Visibility[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`chip chip-selectable${visibility === value ? ' chip-active' : ''}`}
                      aria-pressed={visibility === value}
                      onClick={() => {
                        setVisibility(value);
                        set({ visibility: value });
                        void flush();
                      }}
                    >
                      {VISIBILITY_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>

              {visibility === 'players' && (
                <RevealPicker
                  users={revealUsers}
                  cases={revealCases}
                  value={revealedTo}
                  label="Onthuld aan"
                  onChange={(next) => {
                    setRevealedTo(next);
                    set({ revealedTo: next });
                    void flush();
                  }}
                />
              )}

              <div>
                <span className="label">Vergrendeling</span>
                <div className="row-wrap">
                  <button
                    type="button"
                    className={`chip chip-selectable${isLocked ? ' chip-active' : ''}`}
                    aria-pressed={isLocked}
                    onClick={() => {
                      const next = !isLocked;
                      setIsLocked(next);
                      set({ isLocked: next });
                      void flush();
                    }}
                  >
                    <Icon name="lock" size={13} />
                    {isLocked ? 'Vergrendeld' : 'Open voor iedereen'}
                  </button>
                  <span className="tiny muted">
                    Bewerkingen van spelers gaan bij een vergrendelde fiche naar de
                    beoordelingswachtrij.
                  </span>
                </div>
              </div>
            </div>
          </details>

          <details className="section">
            <summary>
              <Icon name="shield" size={14} /> {words.keeperNotes}
            </summary>
            <textarea
              className="textarea"
              style={{ margin: '0.5rem 0 1rem' }}
              value={keeperNotes}
              placeholder="Wordt nooit aan spelers getoond."
              onChange={(event) => {
                setKeeperNotes(event.target.value);
                set({ keeperNotes: event.target.value });
              }}
              onBlur={() => void flush()}
            />
          </details>
        </>
      )}
    </article>
  );
}
