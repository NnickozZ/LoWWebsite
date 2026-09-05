'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { LiveField, LiveFields } from '@/components/live/LiveFields';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { entryKey } from '@/lib/live/keys';
import { useUi } from '@/components/ui/UiProvider';
import { useIsWide } from '@/components/useIsPhone';

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
import { capitalise } from '@/lib/words';
import type { ArticleMode } from '@/lib/entries/mode';
import { CoverEditor } from './CoverEditor';
import { EntryOutline, type OutlineItem } from './EntryOutline';
import { FieldsEditor, FieldsView, fieldValue } from './FieldsEditor';
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

/**
 * The artikel page (reworked 5 Sep 2026; two faces since §22).
 *
 * §22. The page has a *reading* face and an *editing* face, and the toggle at
 * the top of the header switches between them. Reading is what a wiki article
 * looks like to anybody who has ever used one: a title, the picture and the
 * facts in a box on the right, prose underneath, and not one input. Editing is
 * the page this archive had before, every line a field. Which face you land in
 * is your own setting (Jouw account → Lezen of bewerken); until you set it,
 * your role decides — a Keeper writes the archive so a Keeper lands in
 * editing, everyone else came to read.
 *
 * The editing face is not a right. A player who may only propose can open it
 * too; their changes simply travel as proposals (§10, §17). What the two faces
 * separate is intent, not permission — the old page asked everyone to fill in
 * a form whether they had come to write or only to look something up.
 *
 * Two columns on a wide screen: the text — body, sections, lists, backlinks,
 * history, in the order the Keeper gave the soort — down the left, and a
 * sidebar on the right holding the picture with "Meer info" directly under it
 * as one box (§22: the wiki shape — Wikipedia, Fandom and everything after
 * them put the image at the top of the infobox, and a reader arriving from any
 * of those already knows to look there), then "Op deze pagina" (an outline
 * that scrolls along and marks where you are). Rights, visibility, Keeper notes and the bin sit at
 * the foot of the text under one heading, "Beheer van dit artikel", so that
 * reading and managing are two different places. Under 1024 px the infobox
 * folds up under the header and the outline becomes a row of chips.
 *
 * The shapes are borrowed, on purpose: Wikipedia and Fandom put a page's facts
 * in an infobox beside the prose, Notion, Craft and Google Docs keep an
 * outline beside a long document, and every one of them keeps settings away
 * from content. Recognition over recall, progressive disclosure, overview
 * first — the page is easier to find your way around because it looks like
 * pages people already know.
 */
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
  liveFields,
  defaultMode,
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
   * This component only decides where on the page each one lands. The bin
   * comes in under the id `delete`.
   */
  slots: Record<string, ReactNode>;
  /** §17: the owner's dials, and what this viewer is allowed to do with them. */
  access: {
    settings: AccessSettings;
    canManage: boolean;
    canEdit: boolean;
    viewerId: string;
  };
  /** §17: proposals waiting on this artikel — only the owner or a Keeper gets any. */
  proposals: PendingEdit[];
  /** §18: is this artikel one of the viewer's characters? `null` for a Keeper. */
  character: { linked: boolean; active: boolean } | null;
  /** §18: the other accounts that play this artikel. */
  playedBy: string[];
  /** §19: the maps this artikel is pinned on… */
  onMaps: { pinId: string; mapSlug: string; mapName: string }[];
  /** …and the ones it is not on yet. */
  mapsToPlace: { slug: string; name: string }[];
  /**
   * §20: the shared text, handed over in the page. `state` is the Yjs document
   * as the server had it; `canEdit` is the room's gate for this viewer.
   */
  live: { room: string; state: string; sv: string; canEdit: boolean; user: LiveUser } | null;
  /** §21: the name, the one-liner and the infobox texts as shared fields. */
  liveFields: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
  /**
   * §22: the face this artikel opens in — this person's own setting, already
   * resolved against their role on the server. The toggle overrides it for
   * this artikel; the setting itself only changes in Jouw account.
   */
  defaultMode: ArticleMode;
}) {
  const ui = useUi();
  const router = useRouter();
  const wide = useIsWide();

  /**
   * §22: which face this artikel is wearing. Per artikel and per visit, like
   * Wikipedia's own Lezen/Bewerken — the setting decides where you land, not
   * where you are stuck. Somebody who is not signed in has nothing to edit
   * with, so for them there is one face and no toggle.
   *
   * A brand-new artikel (`?new=1`) opens in editing whatever the setting says:
   * you have just made it, so you are here to fill it in.
   */
  const canToggle = Boolean(access.viewerId);
  const [mode, setMode] = useState<ArticleMode>(
    !canToggle ? 'view' : openAddMore ? 'edit' : defaultMode,
  );
  const reading = mode === 'view';

  const [name, setName] = useState(entry.name);
  const [shortDescription, setShortDescription] = useState(entry.shortDescription);
  const [tags, setTags] = useState(entry.tags);
  const [fields, setFields] = useState(entry.fields);
  const [cover, setCover] = useState({ assetId: entry.coverAssetId, crop: entry.coverCrop });
  const [keeperNotes, setKeeperNotes] = useState(entry.keeperNotes);
  const [visibility, setVisibility] = useState(entry.visibility);
  const [revealedTo, setRevealedTo] = useState(entry.revealedTo);
  const [isLocked, setIsLocked] = useState(entry.isLocked);
  // §18: tying this artikel on as a character, from the artikel itself.
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
  // §21: any change to this artikel, from anywhere, is a reason to re-read the
  // rest of the record. The body's own `saved` frame still arrives too.
  useLiveChanges([entryKey(entry.id)], () => setSavedAt({ at: Date.now(), by: null, keys: [] }));
  // The name and the one-liner are shared fields when the room is open and
  // this person may type: their text then comes from the room, not the fetch.
  const fieldsShared = Boolean(liveFields?.canEdit);
  // …and where that room's own keystrokes stand, for the one save word.
  const [fieldsStatus, setFieldsStatus] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({
    others: [],
    status: 'connecting',
    save: 'idle',
  });

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
        // §22: while reading there is no input to fight over, so the fetched
        // value always wins — otherwise a name changed by someone else would
        // never reach a reader whose room happens to be writable.
        const holdFields = fieldsShared && !readingRef.current;
        if (!holdFields && focusedId !== 'entry-name') setName((current) => (current === data.name ? current : data.name));
        if (!holdFields && focusedId !== 'entry-lead') {
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

  // Read inside the refresh effect above, which must not re-run on a toggle.
  const readingRef = useRef(reading);
  readingRef.current = reading;

  useEffect(() => autosize(leadRef.current), [shortDescription, reading]);

  const words = ui.words;

  /* ------------------------------------------------------------ the outline */

  const [sectionTitles, setSectionTitles] = useState(sections.map((s) => ({ id: s.id, title: s.title })));
  const onOutlineChange = useCallback((next: { id: string; title: string }[]) => {
    setSectionTitles((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);

  const fieldsBlock = entry.typeBlocks.find((block) => block.kind === 'fields' && !block.hidden) ?? null;
  const infoboxHeading = fieldsBlock ? fieldsBlock.title || defaultBlockTitle('fields', words) : '';

  const showManage =
    access.canManage || access.settings.locked || proposals.length > 0 || isKeeper || Boolean(slots.delete);

  const outline = useMemo<OutlineItem[]>(() => {
    const items: OutlineItem[] = [];
    for (const block of entry.typeBlocks) {
      if (block.hidden || block.kind === 'fields') continue;
      const heading = block.title || defaultBlockTitle(block.kind, words);
      if (block.kind === 'body') {
        items.push({ id: `block-${block.id}`, label: heading || 'Tekst', icon: 'file' });
      } else if (block.kind === 'sections') {
        // Nobody without sections has anything to jump to here — and while
        // reading that includes a Keeper, who is not being offered the
        // "Sectie toevoegen" button either.
        if ((!isKeeper || reading) && sectionTitles.length === 0) continue;
        items.push({ id: `block-${block.id}`, label: heading || capitalise(words.sectionPlural), icon: 'book' });
        for (const section of sectionTitles) {
          items.push({ id: `section-${section.id}`, label: section.title || 'Zonder titel', level: 1 });
        }
      } else if (block.kind === 'links' || block.kind === 'derived') {
        items.push({ id: `block-${block.id}`, label: heading || 'Lijst', icon: 'link' });
      } else if (block.kind === 'backlinks') {
        items.push({ id: `block-${block.id}`, label: heading, icon: 'link' });
      } else if (block.kind === 'history') {
        items.push({ id: `block-${block.id}`, label: heading, icon: 'clock' });
      }
    }
    if (showManage) items.push({ id: 'block-manage', label: words.manage, icon: 'shield' });
    return items;
  }, [entry.typeBlocks, isKeeper, reading, sectionTitles, showManage, words]);

  /** On a phone the infobox is one more thing to jump to. */
  const phoneOutline = useMemo<OutlineItem[]>(
    () => (fieldsBlock ? [{ id: 'block-info', label: infoboxHeading, icon: 'edit' }, ...outline] : outline),
    [fieldsBlock, infoboxHeading, outline],
  );

  /* ---------------------------------------------------------- the infobox */

  /**
   * §22: reading, the infobox is the facts that are *known* — a filled field
   * and a tag each get a row, an empty one gets nothing. That is the whole
   * difference between an infobox and a form: a form has to show you every
   * slot, an infobox only has to show you what is in them. An artikel whose
   * fields are all still empty therefore has no infobox at all while reading,
   * rather than a box of blank labels in its margin.
   */
  const readableFields =
    entry.typeFields.length > 0 ? (
      <FieldsView fields={entry.typeFields} values={fields} />
    ) : null;
  const hasReadableInfo = Boolean(readableFields) || tags.length > 0;

  const infoboxBody = reading ? (
    <div className="stack entry-infobox-body">
      {readableFields}
      {tags.length > 0 && (
        <div className="infobox-tags">
          <span className="label">Tags</span>
          <div className="row-wrap" style={{ gap: '0.3rem' }}>
            {tags.map((tag) => (
              <a key={tag} className="tag" href={`/wiki?tag=${encodeURIComponent(tag)}`}>
                {tag}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="stack entry-fields entry-infobox-body">
      {fieldsBlock?.note && (
        <p className="tiny muted" style={{ margin: 0 }}>
          {fieldsBlock.note}
        </p>
      )}
      {entry.typeFields.length > 0 && (
        <FieldsEditor
          key={fieldsVersion}
          compact
          fields={entry.typeFields}
          values={fields}
          onChange={(patch, meta) => {
            const next = { ...fields, ...patch };
            setFields(next);
            if (!meta?.live) set({ fields: patch });
          }}
        />
      )}
      <div className="infobox-tags">
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
  );

  const showInfobox = Boolean(fieldsBlock) && (!reading || hasReadableInfo);

  const infobox = showInfobox ? (
    wide ? (
      <section id="block-info" className="entry-infobox" aria-labelledby="infobox-title">
        <h2 id="infobox-title" className="entry-infobox-title">
          {infoboxHeading}
        </h2>
        {infoboxBody}
      </section>
    ) : (
      <details
        id="block-info"
        className="section entry-infobox entry-infobox-folded"
        open={fieldsBlock!.open || openAddMore || reading}
      >
        <summary>{infoboxHeading}</summary>
        <div style={{ padding: '0.6rem 0 0.8rem' }}>{infoboxBody}</div>
      </details>
    )
  ) : null;

  /* -------------------------------------------------------------- the figure */

  /**
   * §22: the picture, at the top of the sidebar with the facts under it. There
   * is nothing to show reading an artikel that has no picture, and nothing
   * would be an empty frame in the margin — so on that one case the figure is
   * dropped and the box starts at the infobox.
   */
  const showFigure = !reading || Boolean(cover.assetId);
  const figure = showFigure ? (
    <CoverEditor
      assetId={cover.assetId}
      crop={cover.crop}
      alt={entry.name}
      icon={entry.typeIcon}
      colour={entry.typeColour}
      readOnly={reading}
      onChange={(next) => {
        setCover({ assetId: next.coverAssetId, crop: next.coverCrop });
        set({ coverAssetId: next.coverAssetId, coverCrop: next.coverCrop });
      }}
    />
  ) : null;

  /** The picture and the facts read as one box; either half may be missing. */
  const asideBox =
    figure || infobox ? (
      <div className={`entry-aside-box${wide ? '' : ' entry-aside-box-stacked'}`}>
        {figure}
        {infobox}
      </div>
    ) : null;

  /* ------------------------------------------------------------ the blocks */

  /**
   * §11: one block of the page. The built-ins are drawn here; the ones that
   * are a read of the archive come in through `slots`, already rendered on the
   * server. A block the Keeper hid is simply not drawn — nothing is hidden
   * with CSS, which is the same rule the reveals follow. Every block carries
   * an id the outline can jump to.
   */
  function renderBlock(block: PageBlock): ReactNode {
    if (block.hidden) return null;
    const heading = block.title || defaultBlockTitle(block.kind, words);
    const note = block.note ? (
      <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
        {block.note}
      </p>
    ) : null;
    const anchor = `block-${block.id}`;

    switch (block.kind) {
      case 'fields':
        // Drawn once, in the sidebar or folded under the header — never here.
        return null;

      case 'body':
        return (
          <section key={block.id} id={anchor} className="entry-block entry-body-block">
            <h2 className="entry-block-title">{heading || 'Tekst'}</h2>
            {note}
            {live ? (
              /* §20: everyone types in the same text; a reader watches it live. */
              <LiveBody
                room={live.room}
                state={live.state}
                user={live.user}
                canEdit={live.canEdit}
                /* §22: reading is the reader's own choice, not the room's. */
                readOnly={reading}
                placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                /* Proposing is an act of editing; it belongs on that face. */
                proposals={!reading}
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
                editable={!reading}
                placeholder={entry.typeText.bodyPlaceholder || DEFAULT_BODY_PLACEHOLDER}
                onChange={(doc) => set({ body: doc })}
              />
            )}
          </section>
        );

      case 'sections':
        return (
          <div key={block.id} id={anchor} className="entry-block">
            {note}
            <SectionsEditor
              entryId={entry.id}
              sections={sections}
              isKeeper={isKeeper}
              readOnly={reading}
              users={revealUsers}
              cases={revealCases}
              liveUser={live?.user ?? null}
              onOutlineChange={onOutlineChange}
            />
          </div>
        );

      case 'links': {
        // The chosen entries live in `entries.fields` under the block's own
        // key, so they save through the ordinary autosave and the picker,
        // chips and remove buttons are the ones a field already has.
        const linkField: FieldDef = {
          key: block.key ?? block.id,
          label: heading || 'Lijst',
          kind: 'entry_links',
          ofType: block.ofType,
        };
        // §22: reading, an empty hand-filled list is not a list — it is an
        // invitation to fill one in, which is the other face's business.
        if (reading && !fieldValue(linkField, fields[linkField.key])) return null;
        return (
          <details key={block.id} id={anchor} className="section entry-block" open={block.open || reading}>
            <summary>{heading || 'Lijst'}</summary>
            <div className="stack" style={{ padding: '0.6rem 0 1rem' }}>
              {note}
              {reading ? (
                <div>{fieldValue(linkField, fields[linkField.key])}</div>
              ) : (
                <FieldsEditor
                  hideLabels
                  fields={[linkField]}
                  values={fields}
                  onChange={(patch) => {
                    const next = { ...fields, ...patch };
                    setFields(next);
                    set({ fields: patch });
                  }}
                />
              )}
            </div>
          </details>
        );
      }

      // Everything else is a read, rendered on the server and handed over as a
      // slot. Wrapped in a keyed Fragment rather than trusting the slot to have
      // brought a key of its own: these are the children of one array, and the
      // file that builds them is not the file that lists them, so the invariant
      // belongs here where the array is made. The anchor goes on a wrapper: the
      // slot's own markup is the server's business.
      default:
        return (
          <Fragment key={block.id}>
            <div id={anchor} className="entry-block">
              {slots[block.id] ?? null}
            </div>
          </Fragment>
        );
    }
  }

  /* ------------------------------------------------------------ the header */

  const header = (
    /* §22: one column. The picture moved to the sidebar, so the header is the
       title and what surrounds it — there is no second column left to fill. */
    <div className="entry-head entry-head-solo">
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
          <div className="spacer" />
          {/*
            One word for both roads to the archive: the autosave of the
            fields, and the room the text lives in. "Opslaan…" while either
            is on its way; "Opgeslagen" once both have landed. Reading, there
            is nothing on its way, so the word is not there either.
          */}
          {!reading && (
            <p className="save-state" aria-live="polite" style={{ margin: 0 }}>
              {state === 'dirty' || state === 'saving' || liveStatus.save === 'saving' || fieldsStatus.save === 'saving'
                ? saveLabel('saving')
                : state === 'pending' || state === 'error'
                  ? saveLabel(state)
                  : state === 'saved' || liveStatus.save === 'saved' || fieldsStatus.save === 'saved'
                    ? saveLabel('saved')
                    : ''}
            </p>
          )}
          {/* §22: the two faces. Wikipedia's own pair of words, in ours. */}
          {canToggle && (
            <button
              type="button"
              className={`btn btn-small entry-mode-toggle${reading ? '' : ' entry-mode-toggle-on'}`}
              aria-pressed={!reading}
              onClick={() => {
                // Anything half-typed goes to the archive before the inputs
                // that hold it leave the page.
                if (!reading) void flush();
                setMode(reading ? 'edit' : 'view');
              }}
            >
              <Icon name={reading ? 'edit' : 'eye'} size={14} />
              {reading ? 'Bewerken' : 'Lezen'}
            </button>
          )}
          {/* §21: who is here and whether the line is up now sit in the shell's strip, for every page alike. */}
        </div>

        {/*
          §22: reading, the title is a heading and the one-liner is a
          paragraph — the two things every article on the web opens with. An
          empty one-liner simply is not there, where the editing face has to
          keep the box and its placeholder.
        */}
        {reading ? (
          <>
            <h1 className="entry-title">{name}</h1>
            {shortDescription.trim() && <p className="entry-lead">{shortDescription}</p>}
          </>
        ) : (
          <>
            <label className="visually-hidden" htmlFor="entry-name">
              Naam
            </label>
            <LiveField
              field="name"
              id="entry-name"
              className="title-input"
              value={name}
              onValue={(next, meta) => {
                setName(next);
                if (!meta.live) set({ name: next });
              }}
              onBlur={() => void flush()}
            />

            <label className="visually-hidden" htmlFor="entry-lead">
              Korte beschrijving
            </label>
            <LiveField
              as="textarea"
              field="shortDescription"
              id="entry-lead"
              ref={leadRef}
              className="lead-input"
              rows={1}
              placeholder={entry.typeText.descriptionPlaceholder || DEFAULT_DESCRIPTION_PLACEHOLDER}
              value={shortDescription}
              onValue={(next, meta) => {
                setShortDescription(next);
                if (!meta.live) set({ shortDescription: next });
              }}
              onBlur={() => void flush()}
            />
          </>
        )}

        {/*
          The tags are in the infobox too. Editing, that one is the control and
          this row is the echo; reading, the infobox row is the only one, so
          this echo would be the same list printed twice on one screen.
        */}
        {tags.length > 0 && !reading && (
          <div className="row-wrap" style={{ marginTop: '0.3rem' }}>
            {tags.map((tag) => (
              <a key={tag} className="tag" href={`/wiki?tag=${encodeURIComponent(tag)}`}>
                {tag}
              </a>
            ))}
          </div>
        )}

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
                title={`Zet dit ${words.entry} op ${item.name}`}
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
      </div>
    </div>
  );

  /* ---------------------------------------------------------- the managing */

  const manage = showManage ? (
    <section id="block-manage" className="entry-block entry-manage" aria-labelledby="manage-title">
      <h2 id="manage-title" className="entry-manage-title">
        <Icon name="shield" size={15} />
        {words.manage}
      </h2>

      {(access.canManage || access.settings.locked) && (
        <details className="section">
          <summary>
            <Icon name="lock" size={14} /> {words.rights}{' '}
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
              nouns={{ this: `dit ${words.entry}` }}
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
                <span className="label">Wie mag {`dit ${words.entry}`} zien</span>
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
                    Bewerkingen van spelers gaan bij een vergrendeld {words.entry} naar de
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

      {slots.delete ?? null}
    </section>
  ) : null;

  /* -------------------------------------------------------------- render */

  const article = (
    <article className={`page-wide entry-page${reading ? ' entry-page-reading' : ''}`}>
      {header}

      {/* Only worth saying on the face where it changes what happens next. */}
      {!reading && !access.canEdit && (
        <p className="small entry-readonly-note">
          <Icon name="lock" size={13} /> Je kunt dit {words.entry} lezen. Wat je verandert gaat als
          voorstel naar de eigenaar.
        </p>
      )}

      {/* On a narrow screen the picture and the facts sit under the header,
          where a phone wiki puts them, and above the jump chips. */}
      {!wide && asideBox}

      {!wide && <EntryOutline items={phoneOutline} shape="row" label={words.onThisPage} />}

      <div className={`entry-layout${wide ? ' entry-layout-wide' : ''}`}>
        <div className="entry-main">
          {entry.typeBlocks.map((block) => renderBlock(block))}
          {manage}
        </div>

        {wide && (
          <aside className="entry-aside">
            {asideBox}
            <div className="entry-aside-sticky">
              <EntryOutline items={outline} shape="column" label={words.onThisPage} />
            </div>
          </aside>
        )}
      </div>
    </article>
  );

  // §21: the room around the fields. Without one (no viewer, or a page that
  // could not open it) every LiveField is a plain input on the autosave road.
  if (!liveFields) return article;
  return (
    <LiveFields room={liveFields.room} state={liveFields.state} user={liveFields.user} canEdit={liveFields.canEdit} onStatus={setFieldsStatus}>
      {article}
    </LiveFields>
  );
}
