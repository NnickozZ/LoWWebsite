'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { AccessEditor, accessLabel, type AccessSettings } from '@/components/access/AccessEditor';
import { AddToCaseButton } from '@/components/cases/AddToCaseButton';
import type { PendingEdit } from '@/lib/entries/review';
import { ProposalsPanel } from './ProposalsPanel';
import { PinToBoardButton } from '@/components/boards/PinToBoardButton';
import dynamic from 'next/dynamic';
import { RichEditor } from '@/components/editor/RichEditor';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { LivePeople } from '@/components/editor/LivePeople';
import { useUi } from '@/components/ui/UiProvider';

/** §20: client-only, so the server never holds a second copy of Yjs. */
const LiveBody = dynamic(() => import('@/components/editor/LiveBody').then((m) => m.LiveBody), {
  ssr: false,
  loading: () => <div className="editor-body" aria-busy="true" />,
});
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

export type EntryCaseLite = { id: string; slug: string; name: string; confidential: boolean };

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
  access,
  proposals,
  character,
  playedBy,
  onMaps,
  mapsToPlace,
  live,
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
  /** §17: the owner's dials, and what this viewer is allowed to do with them. */
  access: {
    settings: AccessSettings;
    canManage: boolean;
    canEdit: boolean;
    viewerId: string;
  };
  /** §17: proposals waiting on this fiche — only the owner or a Keeper gets any. */
  proposals: PendingEdit[];
  /** §18: is this fiche one of the viewer's characters? `null` for a Keeper. */
  character: { linked: boolean; active: boolean } | null;
  /** §18: the other accounts that play this fiche. */
  playedBy: string[];
  /** §19: the maps this fiche is pinned on… */
  onMaps: { pinId: string; mapSlug: string; mapName: string }[];
  /** …and the ones it is not on yet. */
  mapsToPlace: { slug: string; name: string }[];
  /**
   * §20: the shared text, handed over in the page. `state` is the Yjs document
   * as the server had it; `canEdit` is the room's gate for this viewer.
   */
  live: { room: string; state: string; sv: string; canEdit: boolean; user: LiveUser } | null;
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
  // §18: tying this fiche on as a character, from the fiche itself.
  const [wardrobe, setWardrobe] = useState(character ?? { linked: false, active: false });
  const [wardrobeBusy, setWardrobeBusy] = useState(false);
  const wear = useCallback(
    async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
      setWardrobeBusy(true);
      try {
        const response = await fetch('/api/characters', {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { activeId?: string | null; error?: string };
        if (!response.ok) {
          ui.toast(data.error ?? 'Dat lukte niet.');
          return;
        }
        const active = data.activeId === entry.id;
        setWardrobe({ linked: true, active });
        ui.toast(active ? `Je speelt nu als ${entry.name}.` : `${entry.name} is nu een van je karakters.`);
        router.refresh();
      } catch {
        ui.toast('Geen verbinding.');
      } finally {
        setWardrobeBusy(false);
      }
    },
    [entry.id, entry.name, router, ui],
  );
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
        ui.toast(
          access.canEdit
            ? 'Naar de Keeper gestuurd ter beoordeling.'
            : 'Als voorstel naar de eigenaar gestuurd.',
        );
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
    [entry.id, router, ui, access.canEdit],
  );

  const { state, set, flush } = useAutosave<Patch>({ save });
  const [accessNow, setAccessNow] = useState(access.settings);

  // §20: who else is in the text, and whether the line is up — reported by
  // the client-only editor below and shown in the header.
  const [liveStatus, setLiveStatus] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({
    others: [],
    status: 'connecting',
    save: 'idle',
  });
  const [savedAt, setSavedAt] = useState<{ at: number; by: string | null; keys: string[] } | null>(null);
  const [fieldsVersion, setFieldsVersion] = useState(0);

  /**
   * Someone else saved the rest of the record — name, description, tags,
   * fields, cover. Fetch it and take over whatever this person is not in the
   * middle of typing; the text itself is already shared and needs nothing.
   */
  const lastSavedAt = useRef(0);
  useEffect(() => {
    const saved = savedAt;
    if (!saved || saved.at === lastSavedAt.current) return;
    lastSavedAt.current = saved.at;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/entries/${entry.id}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as {
          name: string;
          shortDescription: string;
          tags: string[];
          fields: Record<string, unknown>;
          coverAssetId: string | null;
          coverCrop: CoverCrop | null;
        };
        if (cancelled) return;
        const active = document.activeElement as HTMLElement | null;
        const focusedId = active?.id ?? '';
        if (focusedId !== 'entry-name') setName((current) => (current === data.name ? current : data.name));
        if (focusedId !== 'entry-lead') {
          setShortDescription((current) => (current === data.shortDescription ? current : data.shortDescription));
        }
        setTags((current) => (JSON.stringify(current) === JSON.stringify(data.tags) ? current : data.tags));
        setCover((current) =>
          current.assetId === data.coverAssetId && JSON.stringify(current.crop) === JSON.stringify(data.coverCrop)
            ? current
            : { assetId: data.coverAssetId, crop: data.coverCrop },
        );
        // The fields' text inputs are uncontrolled; new values need a remount,
        // which is only safe when nobody is typing in one of them.
        if (JSON.stringify(fields) !== JSON.stringify(data.fields) && !active?.closest('.entry-fields')) {
          setFields(data.fields);
          setFieldsVersion((n) => n + 1);
        }
      } catch {
        /* the next save will try again */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAt, entry.id]);

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
            <div className="stack entry-fields" style={{ padding: '0.6rem 0 1rem' }}>
              {note}
              {entry.typeFields.length > 0 && (
                <FieldsEditor
                  key={fieldsVersion}
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
            {live ? (
              /* §20: everyone types in the same text; a reader watches it live. */
              <LiveBody
                room={live.room}
                state={live.state}
                user={live.user}
                canEdit={live.canEdit}
                placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                proposals
                onPropose={(doc) => {
                  set({ body: doc });
                  void flush();
                }}
                onStatus={setLiveStatus}
                onSaved={setSavedAt}
              />
            ) : (
              <RichEditor
                initialDoc={entry.body}
                placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                onChange={(doc) => set({ body: doc })}
              />
            )}
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
              liveUser={live?.user ?? null}
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
            {wardrobe.linked && (
              <span className="chip" title={wardrobe.active ? 'Dit ben je nu' : 'Een van je karakters'}>
                <Icon name="mask" size={13} />
                {wardrobe.active ? `Jouw ${words.character}` : `Een van je ${words.characterPlural}`}
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
            {character && !wardrobe.linked && (
              <button
                type="button"
                className="btn btn-small"
                disabled={wardrobeBusy}
                onClick={() => void wear('POST', { entryId: entry.id })}
              >
                <Icon name="mask" size={15} />
                {words.thisIsMyCharacter}
              </button>
            )}
            {character && wardrobe.linked && !wardrobe.active && (
              <button
                type="button"
                className="btn btn-small"
                disabled={wardrobeBusy}
                onClick={() => void wear('PATCH', { active: entry.id })}
              >
                <Icon name="swap" size={15} />
                Speel als {name || entry.name}
              </button>
            )}
          </div>

          {playedBy.length > 0 && (
            <p className="tiny muted" style={{ marginTop: '0.5rem' }}>
              Gespeeld door {playedBy.join(', ')}
            </p>
          )}

          {(onMaps.length > 0 || mapsToPlace.length > 0) && (
            <p className="row-wrap tiny" style={{ marginTop: '0.5rem', gap: '0.3rem' }}>
              <span className="muted">{words.onTheMap}:</span>
              {onMaps.map((item) => (
                <Link key={item.pinId} className="chip" href={`/maps/${item.mapSlug}?pin=${item.pinId}`}>
                  <Icon name="map" size={12} />
                  {item.mapName}
                </Link>
              ))}
              {mapsToPlace.slice(0, mapsToPlace.length > 3 ? 2 : 3).map((item) => (
                <Link
                  key={item.slug}
                  className="chip chip-selectable"
                  href={`/maps/${item.slug}?place=${entry.id}&name=${encodeURIComponent(name || entry.name)}`}
                  title={`Zet deze ${words.entry} op ${item.name}`}
                >
                  <Icon name="mapPin" size={12} />
                  Zet op {item.name}
                </Link>
              ))}
              {mapsToPlace.length > 3 && (
                <Link
                  className="chip chip-selectable"
                  href={`/maps?place=${entry.id}&name=${encodeURIComponent(name || entry.name)}`}
                >
                  <Icon name="map" size={12} />
                  Zet op een andere {words.map}…
                </Link>
              )}
            </p>
          )}

          {cases.length > 0 && (
            <p className="row-wrap tiny" style={{ marginTop: '0.5rem', gap: '0.3rem' }}>
              <span className="muted">In:</span>
              {cases.map((item) => (
                <Link key={item.id} className="chip" href={`/c/${item.slug}`}>
                  <Icon name="folder" size={12} />
                  {item.name}
                  {item.confidential && <Icon name="lock" size={11} />}
                </Link>
              ))}
            </p>
          )}

          <div className="row-wrap" style={{ marginTop: '0.5rem', gap: '0.6rem' }}>
            {/*
              One word for both roads to the archive: the autosave of the
              fields, and the room the text lives in. "Opslaan…" while either
              is on its way; "Opgeslagen" once both have landed.
            */}
            <p className="save-state" aria-live="polite" style={{ margin: 0 }}>
              {state === 'dirty' || state === 'saving' || liveStatus.save === 'saving'
                ? saveLabel('saving')
                : state === 'pending' || state === 'error'
                  ? saveLabel(state)
                  : state === 'saved' || liveStatus.save === 'saved'
                    ? saveLabel('saved')
                    : ''}
            </p>
            {live && <LivePeople others={liveStatus.others} status={liveStatus.status} />}
          </div>
        </div>
      </div>

      {!access.canEdit && (
        <p className="small" style={{ margin: '0 0 1rem', padding: '0.5rem 0.7rem', border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}>
          <Icon name="lock" size={13} /> Je kunt deze {words.entry} lezen. Wat je verandert gaat als
          voorstel naar de eigenaar.
        </p>
      )}

      {entry.typeBlocks.map((block) => renderBlock(block))}

      {(access.canManage || access.settings.locked) && (
        <details className="section">
          <summary>
            <Icon name="lock" size={14} /> Rechten{' '}
            <span className="muted">
              (kijken: {accessLabel(accessNow.viewMode, accessNow.viewers.length).toLowerCase()},
              bewerken: {accessLabel(accessNow.editMode, accessNow.editors.length).toLowerCase()})
            </span>
          </summary>
          <div style={{ padding: '0.6rem 0 1rem' }}>
            <AccessEditor
              target="entry"
              id={entry.id}
              initial={access.settings}
              canManage={access.canManage}
              isKeeper={isKeeper}
              viewerId={access.viewerId}
              onChange={setAccessNow}
              nouns={{ this: `deze ${words.entry}` }}
            />
          </div>
        </details>
      )}

      <ProposalsPanel entryId={entry.id} initial={proposals} />

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
