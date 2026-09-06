'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { AccessEditor, accessLabel, type AccessSettings } from '@/components/access/AccessEditor';
import { capitalise } from '@/lib/words';
import { NewBoardButton } from '@/components/boards/NewBoardButton';
import { NewTimelineButton } from '@/components/timelines/NewTimelineButton';
import { SCALE_LABELS, type Scale } from '@/lib/timelines/time';
import { Cover } from '@/components/Cover';
import { CoverEditor } from '@/components/entry/CoverEditor';
import type { ArticleMode } from '@/lib/entries/mode';
import dynamic from 'next/dynamic';
import { LiveField, LiveFields } from '@/components/live/LiveFields';
import { RichEditor } from '@/components/editor/RichEditor';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { useIsPhone } from '@/components/useIsPhone';
import { useOverflowing } from '@/components/useOverflowing';

/** §20: client-only, so the server never holds a second copy of Yjs. */
const LiveBody = dynamic(() => import('@/components/editor/LiveBody').then((m) => m.LiveBody), {
  ssr: false,
  loading: () => <div className="editor-body" aria-busy="true" />,
});
import { useUi } from '@/components/ui/UiProvider';
import { saveLabel, useAutosave } from '@/components/entry/useAutosave';
import { relativeTime } from '@/lib/diff';
import type { CaseActivityItem, CaseEntry, CaseStatus } from '@/lib/cases/service';
import type { CoverCrop } from '@/lib/db/schema';
import { PreferredCases } from '@/components/entry/PreferredCases';
import { CaseAddSearch } from './CaseAddSearch';
import { CaseTabsButton, type CaseTabSoort } from './CaseTabsButton';
import { CaseEntryCard } from './CaseEntryCard';

export type CaseGroup = {
  key: string;
  label: string;
  icon: string;
  colour: string;
  /** The entry types this tab covers — "People" is characters and investigators. */
  typeSlugs: string[];
  entries: CaseEntry[];
  /**
   * §30: this tab is here because the Keeper said this soort belongs in this
   * dossier, not because something happens to be filed under it. The page has
   * already decided which tabs there are and in what order (`planCaseTabs`);
   * this only says *why*, so an empty shelf can explain itself.
   */
  pinned: boolean;
};

export type CaseDossierData = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: CaseStatus;
  notes: unknown;
  keeperNotes: string;
  coverAssetId: string | null;
  coverCrop: CoverCrop | null;
};

/** §17: the owner's dials and what this viewer may do with them. */
export type CaseAccess = {
  settings: AccessSettings;
  canManage: boolean;
  canEdit: boolean;
  viewerId: string;
};

export type BoardLite = { id: string; name: string; updatedAt: number };
/** §32 */
export type TimelineLite = { id: string; slug: string; name: string; updatedAt: number; scale: Scale };
/** An account, and (§18) the character it is wearing, if any. */
export type UserLite = { id: string; username: string; character?: string | null };

const STATUSES: CaseStatus[] = ['open', 'cold', 'closed'];
const STATUS_LABELS: Record<CaseStatus, string> = { open: 'open', cold: 'koud', closed: 'gesloten' };

function autosize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function CaseDossier({
  data,
  groups,
  soorten,
  tabTypes,
  members,
  allUsers,
  boards,
  timelines,
  activity,
  lastSeenAt,
  isKeeper,
  access,
  liveNotes,
  liveFields,
  defaultMode,
  binSlot,
}: {
  data: CaseDossierData;
  groups: CaseGroup[];
  /** §30: every soort, for the "Tabbladen" sheet — with what is filed here. */
  soorten: CaseTabSoort[];
  /** §30: `cases.tab_types` — null is "let the tabs follow what is filed". */
  tabTypes: string[] | null;
  /** The people on the view list, for the little row of initials. */
  members: UserLite[];
  allUsers: UserLite[];
  boards: BoardLite[];
  /** §32: the dossier's tijdlijnen, already filtered for this viewer. */
  timelines: TimelineLite[];
  activity: CaseActivityItem[];
  lastSeenAt: number | null;
  isKeeper: boolean;
  access: CaseAccess;
  /** §20: the notes as shared text, or null when the page could not open the room. */
  liveNotes: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
  /** §21: the name and the one-liner as shared fields. */
  liveFields: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
  /**
   * §22: the face this dossier opens in — this person's own setting from Jouw
   * account, already resolved against their role on the server. The toggle at
   * the top overrides it for this visit; the setting itself only changes there.
   */
  defaultMode: ArticleMode;
  /**
   * §11: the bin, built on the server because it is a server action, and handed
   * over the same way the artikel's is. Null when this viewer may not throw the
   * dossier away.
   */
  binSlot: ReactNode;
}) {
  const ui = useUi();
  const router = useRouter();
  const isPhone = useIsPhone();

  const [name, setName] = useState(data.name);
  const [summary, setSummary] = useState(data.summary);
  const [status, setStatus] = useState<CaseStatus>(data.status);
  const [accessNow, setAccessNow] = useState(access.settings);
  const memberIds = accessNow.viewMode === 'some' ? accessNow.viewers : [];

  /**
   * §22: which face this dossier is wearing, and the difference between the two
   * kinds of "no".
   *
   * `readOnly` is about *rights* — this person may look at the file and not
   * change it. `reading` is about the *face they asked for* — a Keeper who
   * came to read the theory rather than rewrite it. `locked` is the two of them
   * together, and it is what every input on this page is switched off by. The
   * split matters because the shared-text room quite correctly says a Keeper
   * may type: without it, choosing to read would still leave a caret blinking
   * in the notes.
   */
  const mayEdit = access.canEdit;
  const canToggle = Boolean(access.viewerId);
  const [mode, setMode] = useState<ArticleMode>(canToggle ? defaultMode : 'view');
  const reading = mode === 'view';
  const readOnly = !mayEdit;
  const locked = readOnly || reading;
  const [keeperNotes, setKeeperNotes] = useState(data.keeperNotes);
  const [cover, setCover] = useState({ assetId: data.coverAssetId, crop: data.coverCrop });
  const [assignOpen, setAssignOpen] = useState(false);
  // §21: when someone else changes the record the page is re-rendered from the
  // server (`LivePage`) and these arrive as new props. Take them over unless
  // this person is in the middle of that very control.
  useEffect(() => {
    setStatus(data.status);
  }, [data.status]);
  useEffect(() => {
    setCover({ assetId: data.coverAssetId, crop: data.coverCrop });
  }, [data.coverAssetId, data.coverCrop]);
  useEffect(() => {
    if (document.activeElement?.id !== 'case-keeper-notes') setKeeperNotes(data.keeperNotes);
  }, [data.keeperNotes]);
  useEffect(() => {
    if (liveFields?.canEdit) return; // the room owns these
    if (document.activeElement?.id !== 'case-name') setName(data.name);
    if (document.activeElement?.id !== 'case-summary') setSummary(data.summary);
  }, [data.name, data.summary, liveFields?.canEdit]);
  const [notesLive, setNotesLive] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({ others: [], status: 'connecting', save: 'idle' });
  // §21: the name and the one-liner are a room too; its save state joins the one word.
  const [fieldsLive, setFieldsLive] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({ others: [], status: 'connecting', save: 'idle' });
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  // The tab row only gets a scrollbar once there are more tabs than fit.
  const tabsOverflow = useOverflowing(tabsRef);

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      const response = await fetch(`/api/cases/${data.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) return { ok: false };
      return { ok: true };
    },
    [data.id],
  );

  const { state, set, flush } = useAutosave<Record<string, unknown>>({ save });

  const tabs = useMemo(() => {
    /*
     * §7 and §30: which soorten have a tab is decided on the server now —
     * `planCaseTabs` keeps everything with something filed in it and adds the
     * soorten this dossier was told it has, in the Keeper's order. What is left
     * here is drawing them. Overzicht, Prikbord and Activiteit keep their
     * places at either end, as they always did.
     */
    return [
      { key: 'overview', label: 'Overzicht', icon: 'file' },
      ...groups.map((group) => ({ key: group.key, label: group.label, icon: group.icon })),
      { key: 'board', label: 'Prikbord', icon: 'board' },
      { key: 'timeline', label: 'Tijdlijn', icon: 'timeline' },
      { key: 'activity', label: 'Activiteit', icon: 'clock' },
    ];
  }, [groups]);

  const [tab, setTab] = useState('overview');
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'overview';
  const refresh = useCallback(() => router.refresh(), [router]);

  useEffect(() => autosize(summaryRef.current), [summary, isPhone]);

  const recent = useMemo(
    () =>
      groups
        .flatMap((group) => group.entries)
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, 4),
    [groups],
  );

  const allTypeSlugs = useMemo(() => groups.flatMap((group) => group.typeSlugs), [groups]);

  /* ------------------------------------------------------------- sections */

  const overview = (
    <div>
      {/* §22: reading, a shelf is what is on it. The box that puts things there
          belongs to the other face. */}
      {!locked && (
        <CaseAddSearch
          caseId={data.id}
          typeSlugs={allTypeSlugs.length ? undefined : undefined}
          placeholder="Voeg iets toe aan dit dossier…"
          onAdded={refresh}
        />
      )}

      <div className="stack" style={{ marginBottom: '1.2rem' }}>
        <div>
          <span className="label row" style={{ gap: '0.6rem' }}>
            Dossiernotities
          </span>
          {liveNotes ? (
            <LiveBody
              room={liveNotes.room}
              state={liveNotes.state}
              user={liveNotes.user}
              canEdit={liveNotes.canEdit && !readOnly}
              /* §22: harder than `canEdit` — the room may say yes, the reader said no. */
              readOnly={reading}
              placeholder={`Wat is de werktheorie? Typ @ of [[ om een ${ui.words.entry} te koppelen.`}
              onStatus={setNotesLive}
            />
          ) : (
            <RichEditor
              initialDoc={data.notes}
              editable={!locked}
              placeholder={`Wat is de werktheorie? Typ @ of [[ om een ${ui.words.entry} te koppelen.`}
              onChange={(doc) => !locked && set({ notes: doc })}
            />
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <p className="eyebrow">Laatst toegevoegd</p>
          <div className="card-grid">
            {recent.map((entry) => (
              <CaseEntryCard key={entry.id} caseId={data.id} entry={entry} onChanged={refresh} readOnly={locked} />
            ))}
          </div>
        </>
      )}

      {isKeeper && (
        <details className="section" style={{ marginTop: '1.5rem' }}>
          <summary>
            <Icon name="shield" size={14} /> Notities van de Keeper
          </summary>
          {locked ? (
            <p className="small" style={{ margin: '0.5rem 0 1rem', whiteSpace: 'pre-wrap' }}>
              {keeperNotes || <span className="muted">Nog niets opgeschreven.</span>}
            </p>
          ) : (
            <textarea
              id="case-keeper-notes"
              className="textarea"
              style={{ margin: '0.5rem 0 1rem' }}
              value={keeperNotes}
              placeholder="Nooit zichtbaar voor spelers."
              onChange={(event) => {
                setKeeperNotes(event.target.value);
                set({ keeperNotes: event.target.value });
              }}
              onBlur={() => void flush()}
            />
          )}
        </details>
      )}

      {/* §11: the bin, at the foot of the file and folded — the same place and
          the same manners as the artikel's. */}
      {!locked && binSlot}
    </div>
  );

  const groupSection = (group: CaseGroup) => (
    <div>
      {!locked && (
        <CaseAddSearch
          caseId={data.id}
          typeSlugs={group.typeSlugs}
          placeholder={`Zoek of maak ${group.label.toLowerCase()}…`}
          onAdded={refresh}
        />
      )}
      {group.entries.length ? (
        <div className="card-grid">
          {group.entries.map((entry) => (
            <CaseEntryCard key={entry.id} caseId={data.id} entry={entry} onChanged={refresh} readOnly={locked} />
          ))}
        </div>
      ) : (
        <div className="empty">
          {/* §30: a shelf that is here because this dossier was told it should
              be says so, rather than looking like an accident. */}
          {group.pinned
            ? `Nog geen ${group.label.toLowerCase()} in dit dossier.`
            : 'Hier is nog niets toegevoegd.'}
        </div>
      )}
    </div>
  );

  const boardSection = (
    <div>
      {!locked && (
        <div className="row-wrap" style={{ marginBottom: '0.9rem' }}>
          <NewBoardButton caseId={data.id} />
        </div>
      )}
      {boards.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {boards.map((board) => (
            <li key={board.id} style={{ borderBottom: '1px solid var(--rule)' }}>
              <Link
                href={`/b/${board.id}`}
                className="row"
                style={{ color: 'inherit', textDecoration: 'none', padding: '0.7rem 0' }}
              >
                <Icon name="board" size={18} style={{ color: 'var(--ink-muted)' }} />
                <span style={{ flex: 1 }}>{board.name}</span>
                <span className="tiny muted">{relativeTime(board.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>Nog geen prikbord.</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Op een kurkbord zie je het snelst hoe deze stukken bij elkaar passen.
          </p>
        </div>
      )}
    </div>
  );

  const timelineSection = (
    <div>
      {!locked && (
        <div className="row-wrap" style={{ marginBottom: '0.9rem' }}>
          <NewTimelineButton caseId={data.id} />
        </div>
      )}
      {timelines.length ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {timelines.map((timeline) => (
            <li key={timeline.id} style={{ borderBottom: '1px solid var(--rule)' }}>
              <Link
                href={`/timelines/${timeline.slug}`}
                className="row"
                style={{ color: 'inherit', textDecoration: 'none', padding: '0.7rem 0' }}
              >
                <Icon name="timeline" size={18} style={{ color: 'var(--ink-muted)' }} />
                <span style={{ flex: 1 }}>{timeline.name}</span>
                <span className="tiny muted">{SCALE_LABELS[timeline.scale].toLowerCase()}</span>
                <span className="tiny muted">{relativeTime(timeline.updatedAt)}</span>
                <Icon name="chevron" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p style={{ margin: 0 }}>Nog geen tijdlijn.</p>
          <p className="small" style={{ margin: '0.4rem 0 0' }}>
            Op een tijdlijn zie je in welke volgorde dit allemaal gebeurd is — en wat er tussen zit.
          </p>
        </div>
      )}
    </div>
  );

  const activitySection = (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {activity.map((item, index) => {
        const isFirstOld = lastSeenAt
          ? item.createdAt <= lastSeenAt &&
            (index === 0 || activity[index - 1].createdAt > lastSeenAt)
          : false;
        return (
          <li key={item.id}>
            {isFirstOld && index > 0 && <p className="since-divider">Vóór je laatste bezoek</p>}
            <div
              className="row"
              style={{ borderBottom: '1px solid var(--rule)', padding: '0.5rem 0' }}
            >
              <span className="small" style={{ flex: 1 }}>
                <strong title={item.actorAccount ?? item.actorName ?? undefined}>
                  {item.actorLabel ?? item.actorName ?? 'Iemand'}
                </strong>{' '}
                {verbText(item.verb)}
                {item.entryName && item.entrySlug ? (
                  <>
                    {' '}
                    <Link href={`/e/${item.entrySlug}`}>{item.entryName}</Link>
                  </>
                ) : item.boardName ? (
                  <> {item.boardName}</>
                ) : null}
                {verbTail(item.verb)}
              </span>
              <span className="tiny muted">{relativeTime(item.createdAt)}</span>
            </div>
          </li>
        );
      })}
      {!activity.length && <li className="muted small">Hier is nog niets gebeurd.</li>}
    </ul>
  );

  const sectionFor = (key: string) => {
    if (key === 'overview') return overview;
    if (key === 'board') return boardSection;
    if (key === 'timeline') return timelineSection;
    if (key === 'activity') return activitySection;
    const group = groups.find((g) => g.key === key);
    return group ? groupSection(group) : null;
  };

  /* --------------------------------------------------------------- header */

  // §22: reading, a dossier with no picture has nothing to put in the left-hand
  // column, so the header stops being two columns rather than leaving one empty.
  const showsCover = !locked || Boolean(cover.assetId);

  const header = (
    <header className={`case-head${showsCover ? '' : ' case-head-solo'}`}>
      {/* The file's own picture: a location, a photograph of the principal, a
          scan of the thing that started it. Shown whole here; the Case Files
          grid squares it off with its own crop, exactly like an entry.
          §22: reading, a dossier with no picture has no frame at all — the
          same rule the artikel's reading face follows. */}
      {locked ? (
        cover.assetId && (
          <figure className="entry-figure" style={{ margin: 0 }}>
            <Cover assetId={cover.assetId} crop={cover.crop} alt={name} icon="folder" colour="var(--ink-muted)" />
          </figure>
        )
      ) : (
        <CoverEditor
          assetId={cover.assetId}
          crop={cover.crop}
          alt={name}
          icon="folder"
          colour="var(--ink-muted)"
          onChange={(next) => {
            setCover({ assetId: next.coverAssetId, crop: next.coverCrop });
            set({ coverAssetId: next.coverAssetId, coverCrop: next.coverCrop });
          }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <div className="row-wrap" style={{ marginBottom: '0.4rem' }}>
          <span className={`stamp${status === 'open' ? '' : ' stamp-muted'}`}>
            {STATUS_LABELS[status]}
          </span>
          {accessNow.viewMode === 'some' && <span className="stamp">Vertrouwelijk</span>}
          {accessNow.viewMode === 'private' && <span className="stamp">Privé</span>}
          {readOnly && (
            <span className="chip" title="Je kunt dit dossier bekijken, niet bewerken.">
              <Icon name="lock" size={12} />
              Alleen kijken
            </span>
          )}
          <div className="spacer" />
          {!reading && (
            <p className="save-state" aria-live="polite" style={{ margin: 0 }}>
              {state === 'dirty' || state === 'saving' || notesLive.save === 'saving' || fieldsLive.save === 'saving'
                ? saveLabel('saving')
                : state === 'pending' || state === 'error'
                  ? saveLabel(state)
                  : state === 'saved' || notesLive.save === 'saved' || fieldsLive.save === 'saved'
                    ? saveLabel('saved')
                    : ''}
            </p>
          )}
          {/* §22: the two faces, in the same pair of words the artikel uses. */}
          {canToggle && (
            <button
              type="button"
              className={`btn btn-small entry-mode-toggle${reading ? '' : ' entry-mode-toggle-on'}`}
              aria-pressed={!reading}
              onClick={() => {
                // Anything half-typed reaches the archive before the inputs
                // holding it leave the page.
                if (!reading) void flush();
                setMode(reading ? 'edit' : 'view');
              }}
            >
              <Icon name={reading ? 'edit' : 'eye'} size={14} />
              {reading ? 'Bewerken' : 'Lezen'}
            </button>
          )}
        </div>

        {/*
          §22: reading, the name is a heading and the one-liner is a paragraph —
          the two things any file opens with. An empty one-liner is simply not
          there, where the editing face has to keep the box and its placeholder.
        */}
        {reading ? (
          <>
            <h1 className="entry-title">{name || 'Naamloos dossier'}</h1>
            {summary.trim() && <p className="entry-lead">{summary}</p>}
          </>
        ) : (
          <>
            <label className="visually-hidden" htmlFor="case-name">
              Naam van het dossier
            </label>
            <LiveField
              field="name"
              id="case-name"
              className="title-input"
              value={name}
              readOnly={readOnly}
              onValue={(next, meta) => {
                setName(next);
                if (!meta.live && !readOnly) set({ name: next });
              }}
              onBlur={() => void flush()}
            />

            <label className="visually-hidden" htmlFor="case-summary">
              Samenvatting
            </label>
            {/* A textarea rather than an input: one line on desktop, but it wraps
              instead of clipping on a phone. */}
            <LiveField
              as="textarea"
              field="summary"
              id="case-summary"
              ref={summaryRef}
              className="lead-input"
              rows={1}
              value={summary}
              readOnly={readOnly}
              placeholder="Eén regel: wat wordt er onderzocht?"
              onValue={(next, meta) => {
                setSummary(next);
                if (!meta.live && !readOnly) set({ summary: next });
              }}
              onBlur={() => void flush()}
            />
          </>
        )}

        <div className="row-wrap" style={{ marginTop: '0.6rem' }}>
          {/* §22: reading, the state of the file is the stamp above; a row of
              buttons to change it is a form. */}
          {!locked &&
            STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip chip-selectable${value === status ? ' chip-active' : ''}`}
                onClick={() => {
                  setStatus(value);
                  set({ status: value });
                }}
              >
                {STATUS_LABELS[value]}
              </button>
            ))}

          <span style={{ width: 8 }} />

          {/*
            §30: which soorten this dossier has shelves for. Behind `locked`
            like every other input on this page — a player who may only look,
            and anybody who came to read, does not get it — and behind
            `canEdit` on the server, where the answer is a 403.
          */}
          {!locked && (
            <CaseTabsButton
              caseId={data.id}
              soorten={soorten}
              tabTypes={tabTypes}
              onChanged={refresh}
            />
          )}

          {(access.canManage || accessNow.locked) && (
            <button
              type="button"
              className={`chip chip-selectable${assignOpen ? ' chip-active' : ''}`}
              onClick={() => setAssignOpen((open) => !open)}
              aria-expanded={assignOpen}
              title="Wie mag dit dossier zien en bewerken"
            >
              <Icon name={accessNow.viewMode === 'all' ? 'eye' : 'lock'} size={13} />
              {accessNow.viewMode === 'some'
                ? `${capitalise(ui.words.assigned)}: ${accessNow.viewers.length}`
                : `Kijken: ${accessLabel(accessNow.viewMode).toLowerCase()}`}
              {accessNow.editMode !== 'all' &&
                ` · bewerken: ${accessLabel(accessNow.editMode, accessNow.editors.length, ui.words.assigned).toLowerCase()}`}
            </button>
          )}

          {memberIds.length > 0 && (
            <span className="row" style={{ gap: 4 }} title={`${capitalise(ui.words.assigned)}: wie dit ${ui.words.case} mag zien`}>
              {allUsers
                .filter((user) => memberIds.includes(user.id))
                .slice(0, 6)
                .map((user) => (
                  <span
                    key={user.id}
                    title={user.character ? `${user.character} (${user.username})` : user.username}
                    className="tiny"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: '1px solid var(--rule)',
                      background: 'var(--paper-dark)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontFamily: 'var(--stamp-face)',
                    }}
                  >
                    {initials(user.character ?? user.username)}
                  </span>
                ))}
            </span>
          )}
        </div>

        {assignOpen && (
          <div
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-raised)',
              padding: '0.7rem',
              marginTop: '0.6rem',
            }}
          >
            <AccessEditor
              target="case"
              id={data.id}
              initial={access.settings}
              canManage={access.canManage}
              isKeeper={isKeeper}
              viewerId={access.viewerId}
              onChange={setAccessNow}
              nouns={{ this: `dit ${ui.words.case}`, some: capitalise(ui.words.assigned) }}
            />
          </div>
        )}
      </div>
    </header>
  );

  /* --------------------------------------------------------------- render */

  // §21: the room around the name and the one-liner, whatever the layout.
  // §31: and, around both, the dossier itself — everything opened on this page
  // offers what is already filed here before the rest of the archive.
  const inRoom = (content: ReactNode) => (
    <PreferredCases ids={[data.id]}>
      {liveFields ? (
        <LiveFields room={liveFields.room} state={liveFields.state} user={liveFields.user} canEdit={liveFields.canEdit} onStatus={setFieldsLive}>
          {content}
        </LiveFields>
      ) : (
        content
      )}
    </PreferredCases>
  );

  if (isPhone) {
    // §7: the same sections stacked, with sticky headers and a jump menu.
    return inRoom(
      <div className="page">
        {header}

        <div className="jump-menu">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className="chip chip-selectable"
              onClick={() =>
                sectionRefs.current[item.key]?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }
            >
              <Icon name={item.icon} size={13} />
              {item.label}
            </button>
          ))}
        </div>

        {tabs.map((item) => (
          <section
            key={item.key}
            ref={(element) => {
              sectionRefs.current[item.key] = element;
            }}
            style={{ marginBottom: '1.6rem', scrollMarginTop: '3.2rem' }}
          >
            <h2 className="sticky-section-head">
              <Icon name={item.icon} size={16} />
              {item.label}
            </h2>
            {sectionFor(item.key)}
          </section>
        ))}
      </div>,
    );
  }

  return inRoom(
    <div className="page-wide">
      {header}

      <div
        ref={tabsRef}
        className={`case-tabs${tabsOverflow ? ' case-tabs-scrollable' : ''}`}
        role="tablist"
        aria-label="Onderdelen van het dossier"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={item.key === activeTab}
            className={`case-tab${item.key === activeTab ? ' case-tab-active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" style={{ paddingTop: '1.1rem' }}>
        {sectionFor(activeTab)}
      </div>
    </div>,
  );
}

function verbText(verb: string): string {
  switch (verb) {
    case 'case.created':
      return 'opende dit dossier';
    case 'case.entry_added':
      return 'voegde';
    case 'case.entry_removed':
      return 'haalde';
    case 'case.note_changed':
      return 'schreef een notitie bij';
    case 'case.edited':
      return 'bewerkte het dossier';
    case 'board.created':
      return 'maakte prikbord';
    case 'board.changed':
      return 'werkte aan prikbord';
    case 'board.deleted':
      return 'verwijderde prikbord';
    case 'timeline.created':
      return 'maakte tijdlijn';
    case 'timeline.event_added':
      return 'zette op de tijdlijn:';
    case 'timeline.deleted':
      return 'verwijderde tijdlijn';
    default:
      return 'wijzigde';
  }
}

/** Dutch puts the second half of a separable verb after the object. */
function verbTail(verb: string): string {
  switch (verb) {
    case 'case.entry_added':
      return ' toe';
    case 'case.entry_removed':
      return ' uit het dossier';
    case 'board.created':
    case 'timeline.created':
      return ' aan';
    default:
      return '';
  }
}
