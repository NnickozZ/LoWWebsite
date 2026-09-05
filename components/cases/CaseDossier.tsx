'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { AccessEditor, accessLabel, type AccessSettings } from '@/components/access/AccessEditor';
import { NewBoardButton } from '@/components/boards/NewBoardButton';
import { CoverEditor } from '@/components/entry/CoverEditor';
import dynamic from 'next/dynamic';
import { LivePeople } from '@/components/editor/LivePeople';
import { RichEditor } from '@/components/editor/RichEditor';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { useIsPhone } from '@/components/useIsPhone';

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
import { CaseAddSearch } from './CaseAddSearch';
import { CaseEntryCard } from './CaseEntryCard';

export type CaseGroup = {
  key: string;
  label: string;
  icon: string;
  colour: string;
  /** The entry types this tab covers — "People" is characters and investigators. */
  typeSlugs: string[];
  entries: CaseEntry[];
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
  members,
  allUsers,
  boards,
  activity,
  lastSeenAt,
  isKeeper,
  access,
  liveNotes,
}: {
  data: CaseDossierData;
  groups: CaseGroup[];
  /** The people on the view list, for the little row of initials. */
  members: UserLite[];
  allUsers: UserLite[];
  boards: BoardLite[];
  activity: CaseActivityItem[];
  lastSeenAt: number | null;
  isKeeper: boolean;
  access: CaseAccess;
  /** §20: the notes as shared text, or null when the page could not open the room. */
  liveNotes: { room: string; state: string; canEdit: boolean; user: LiveUser } | null;
}) {
  const ui = useUi();
  const router = useRouter();
  const isPhone = useIsPhone();

  const [name, setName] = useState(data.name);
  const [summary, setSummary] = useState(data.summary);
  const [status, setStatus] = useState<CaseStatus>(data.status);
  const [accessNow, setAccessNow] = useState(access.settings);
  const memberIds = accessNow.viewMode === 'some' ? accessNow.viewers : [];
  const readOnly = !access.canEdit;
  const [keeperNotes, setKeeperNotes] = useState(data.keeperNotes);
  const [cover, setCover] = useState({ assetId: data.coverAssetId, crop: data.coverCrop });
  const [assignOpen, setAssignOpen] = useState(false);
  const [notesLive, setNotesLive] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({ others: [], status: 'connecting', save: 'idle' });
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const summaryRef = useRef<HTMLTextAreaElement>(null);

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
    // §7: empty type tabs are hidden. Overview, Board and Activity always show.
    const populated = groups.filter((group) => group.entries.length > 0);
    return [
      { key: 'overview', label: 'Overzicht', icon: 'file' },
      ...populated.map((group) => ({ key: group.key, label: group.label, icon: group.icon })),
      { key: 'board', label: 'Prikbord', icon: 'board' },
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
      {!readOnly && (
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
            {liveNotes && (
              <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                <LivePeople others={notesLive.others} status={notesLive.status} />
              </span>
            )}
          </span>
          {liveNotes ? (
            <LiveBody
              room={liveNotes.room}
              state={liveNotes.state}
              user={liveNotes.user}
              canEdit={liveNotes.canEdit && !readOnly}
              placeholder="Wat is de werktheorie? Typ @ of [[ om een fiche te koppelen."
              onStatus={setNotesLive}
            />
          ) : (
            <RichEditor
              initialDoc={data.notes}
              editable={!readOnly}
              placeholder="Wat is de werktheorie? Typ @ of [[ om een fiche te koppelen."
              onChange={(doc) => !readOnly && set({ notes: doc })}
            />
          )}
        </div>
      </div>

      {recent.length > 0 && (
        <>
          <p className="eyebrow">Laatst toegevoegd</p>
          <div className="card-grid">
            {recent.map((entry) => (
              <CaseEntryCard key={entry.id} caseId={data.id} entry={entry} onChanged={refresh} readOnly={readOnly} />
            ))}
          </div>
        </>
      )}

      {isKeeper && (
        <details className="section" style={{ marginTop: '1.5rem' }}>
          <summary>
            <Icon name="shield" size={14} /> Notities van de Keeper
          </summary>
          <textarea
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
        </details>
      )}
    </div>
  );

  const groupSection = (group: CaseGroup) => (
    <div>
      {!readOnly && (
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
            <CaseEntryCard key={entry.id} caseId={data.id} entry={entry} onChanged={refresh} readOnly={readOnly} />
          ))}
        </div>
      ) : (
        <div className="empty">Hier is nog niets toegevoegd.</div>
      )}
    </div>
  );

  const boardSection = (
    <div>
      {!readOnly && (
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
    if (key === 'activity') return activitySection;
    const group = groups.find((g) => g.key === key);
    return group ? groupSection(group) : null;
  };

  /* --------------------------------------------------------------- header */

  const header = (
    <header className="case-head">
      {/* The file's own picture: a location, a photograph of the principal, a
          scan of the thing that started it. Shown whole here; the Case Files
          grid squares it off with its own crop, exactly like an entry. */}
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
          <p className="save-state" aria-live="polite" style={{ margin: 0 }}>
            {state === 'dirty' || state === 'saving' || notesLive.save === 'saving'
              ? saveLabel('saving')
              : state === 'pending' || state === 'error'
                ? saveLabel(state)
                : state === 'saved' || notesLive.save === 'saved'
                  ? saveLabel('saved')
                  : ''}
          </p>
        </div>

        <label className="visually-hidden" htmlFor="case-name">
          Naam van het dossier
        </label>
        <input
          id="case-name"
          className="title-input"
          value={name}
          readOnly={readOnly}
          onChange={(event) => {
            setName(event.target.value);
            set({ name: event.target.value });
          }}
          onBlur={() => void flush()}
        />

        <label className="visually-hidden" htmlFor="case-summary">
          Samenvatting
        </label>
        {/* A textarea rather than an input: one line on desktop, but it wraps
          instead of clipping on a phone. */}
        <textarea
          id="case-summary"
          ref={summaryRef}
          className="lead-input"
          rows={1}
          value={summary}
          readOnly={readOnly}
          placeholder="Eén regel: wat wordt er onderzocht?"
          onChange={(event) => {
            setSummary(event.target.value);
            autosize(event.target);
            set({ summary: event.target.value });
          }}
          onBlur={() => void flush()}
        />

        <div className="row-wrap" style={{ marginTop: '0.6rem' }}>
          {STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip chip-selectable${value === status ? ' chip-active' : ''}`}
              disabled={readOnly}
              onClick={() => {
                setStatus(value);
                set({ status: value });
              }}
            >
              {STATUS_LABELS[value]}
            </button>
          ))}

          <span style={{ width: 8 }} />

          {(access.canManage || accessNow.locked) && (
            <button
              type="button"
              className={`chip chip-selectable${assignOpen ? ' chip-active' : ''}`}
              onClick={() => setAssignOpen((open) => !open)}
              aria-expanded={assignOpen}
              title="Wie mag dit dossier zien en bewerken"
            >
              <Icon name={accessNow.viewMode === 'all' ? 'eye' : 'lock'} size={13} />
              Rechten: kijken {accessLabel(accessNow.viewMode, accessNow.viewers.length).toLowerCase()},
              bewerken {accessLabel(accessNow.editMode, accessNow.editors.length).toLowerCase()}
            </button>
          )}

          {memberIds.length > 0 && (
            <span className="row" style={{ gap: 4 }} title="Wie dit dossier mag zien">
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
              nouns={{ this: `dit ${ui.words.case}` }}
            />
          </div>
        )}
      </div>
    </header>
  );

  /* --------------------------------------------------------------- render */

  if (isPhone) {
    // §7: the same sections stacked, with sticky headers and a jump menu.
    return (
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
      </div>
    );
  }

  return (
    <div className="page-wide">
      {header}

      <div className="case-tabs" role="tablist" aria-label="Onderdelen van het dossier">
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
    </div>
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
      return ' aan';
    default:
      return '';
  }
}
