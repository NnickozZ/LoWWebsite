'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/Icon';
import { LivePeople } from '@/components/editor/LivePeople';
import { RichEditor } from '@/components/editor/RichEditor';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { useUi } from '@/components/ui/UiProvider';

/** §20: client-only, so the server never holds a second copy of Yjs. */
const LiveBody = dynamic(() => import('@/components/editor/LiveBody').then((m) => m.LiveBody), {
  ssr: false,
  loading: () => <div className="editor-body" aria-busy="true" />,
});
import type { Visibility } from '@/lib/db/schema';
import { RevealPicker, type RevealableCase, type RevealableUser } from './RevealPicker';

export type SectionLite = {
  id: string;
  title: string;
  body: unknown;
  visibility: Visibility;
  revealedTo: string[];
  /** §20: the section's own room, if this viewer may be in it. */
  live?: { room: string; state: string; canEdit: boolean } | null;
};

/**
 * §20: one section's text, shared. Each section is its own room with its own
 * gate (§9), so a Keeper typing in a hidden section is seen by other Keepers
 * and by nobody else — and the moment it is revealed, the players who may
 * read it join the same room.
 */
function SectionText({
  section,
  user,
  editable,
  readOnly = false,
  placeholder,
  onChange,
}: {
  section: SectionLite;
  user: LiveUser | null;
  editable: boolean;
  /** §22: the reading face. A harder no than `editable` — see `LiveBody`. */
  readOnly?: boolean;
  placeholder?: string;
  onChange: (doc: unknown) => void;
}) {
  const [status, setStatus] = useState<{ others: LivePerson[]; status: LiveStatus; save: LiveSave }>({ others: [], status: 'connecting', save: 'idle' });
  if (!section.live || !user) {
    return (
      <RichEditor
        initialDoc={section.body}
        editable={editable && !readOnly}
        placeholder={placeholder}
        onChange={onChange}
      />
    );
  }
  return (
    <>
      <LiveBody
        room={section.live.room}
        state={section.live.state}
        user={user}
        canEdit={editable && section.live.canEdit}
        readOnly={readOnly}
        placeholder={placeholder}
        onStatus={setStatus}
      />
      {(status.others.length > 0 || status.status !== 'live') && (
        <p className="tiny" style={{ margin: '0.3rem 0 0' }}>
          <LivePeople others={status.others} status={status.status} />
        </p>
      )}
    </>
  );
}

const VISIBILITY_LABELS: Record<Visibility, string> = {
  keeper: 'Alleen de Keeper',
  players: 'Gekozen spelers',
  all: 'Iedereen',
};

/**
 * §9: extra titled sections with their own visibility — how the Keeper preps
 * "what is really in the cellar" and flips it on mid-session from a phone.
 *
 * A player is only ever handed the sections they may read; the ones they may
 * not never reach this component, so there is nothing to hide in the DOM.
 */
export function SectionsEditor({
  entryId,
  sections: initial,
  isKeeper,
  users,
  cases,
  liveUser,
  readOnly = false,
  onOutlineChange,
}: {
  entryId: string;
  sections: SectionLite[];
  isKeeper: boolean;
  users: RevealableUser[];
  cases: RevealableCase[];
  /** §20: this person's name and ink in the shared text; null when not signed in. */
  liveUser: LiveUser | null;
  /**
   * §22: the reading face. A Keeper reading gets exactly what a player reading
   * gets — the sections they may see, as prose, with no title inputs, no
   * visibility chips and no "Sectie toevoegen".
   */
  readOnly?: boolean;
  /** The page's outline follows the titles: told on every add, rename and removal. */
  onOutlineChange?: (sections: { id: string; title: string }[]) => void;
}) {
  const ui = useUi();
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [busy, setBusy] = useState(false);

  const tell = onOutlineChange;
  useEffect(() => {
    tell?.(sections.map((section) => ({ id: section.id, title: section.title })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  async function patch(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/sections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) ui.toast('Opslaan is niet gelukt.');
  }

  function update(id: string, next: Partial<SectionLite>) {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, ...next } : section)),
    );
  }

  async function add() {
    setBusy(true);
    try {
      const response = await fetch(`/api/entries/${entryId}/sections`, { method: 'POST' });
      if (!response.ok) {
        ui.toast('Sectie toevoegen is niet gelukt.');
        return;
      }
      const data = await response.json();
      setSections((current) => [
        ...current,
        { id: data.sectionId, title: '', body: null, visibility: 'keeper', revealedTo: [] },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const doomed = sections.find((section) => section.id === id);
    setSections((current) => current.filter((section) => section.id !== id));
    await fetch(`/api/sections/${id}`, { method: 'DELETE' });
    ui.toast(`Sectie ${doomed?.title ? `‘${doomed.title}’ ` : ''}verwijderd.`);
    router.refresh();
  }

  if (!isKeeper || readOnly) {
    // Read-only: the sections this person may see, in order, as part of the entry.
    if (!sections.length) return null;
    return (
      <>
        {sections.map((section) => (
          <section key={section.id} id={`section-${section.id}`} className="entry-section">
            <h2 className="entry-section-title">{section.title || 'Zonder titel'}</h2>
            <SectionText
              section={section}
              user={liveUser}
              editable={false}
              readOnly
              onChange={() => undefined}
            />
          </section>
        ))}
      </>
    );
  }

  return (
    <section className="entry-sections">
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{ui.words.sectionPlural.charAt(0).toUpperCase() + ui.words.sectionPlural.slice(1)}</h2>
        <div className="spacer" />
        <button type="button" className="btn btn-small" onClick={() => void add()} disabled={busy}>
          <Icon name="plus" size={15} />
          Sectie toevoegen
        </button>
      </div>

      {!sections.length && (
        <p className="tiny muted" style={{ margin: 0 }}>
          Een sectie is een stuk tekst met een eigen zichtbaarheid — wat er écht in de kelder ligt,
          klaargezet en later aangezet.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.id} id={`section-${section.id}`} className="entry-section entry-section-editing">
          <div className="row-wrap" style={{ marginBottom: '0.4rem' }}>
            <label className="visually-hidden" htmlFor={`section-title-${section.id}`}>
              Titel van de sectie
            </label>
            <input
              id={`section-title-${section.id}`}
              className="input"
              style={{ flex: '1 1 12rem', minHeight: 38 }}
              value={section.title}
              placeholder="Titel van de sectie"
              onChange={(event) => update(section.id, { title: event.target.value })}
              onBlur={(event) => void patch(section.id, { title: event.target.value })}
            />
            <button
              type="button"
              className="btn btn-small btn-ghost"
              aria-label={`Sectie ${section.title || 'zonder titel'} verwijderen`}
              onClick={() => void remove(section.id)}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>

          <div className="row-wrap" style={{ marginBottom: '0.5rem' }}>
            <span className="tiny muted">Zichtbaar voor</span>
            {(['keeper', 'players', 'all'] as Visibility[]).map((value) => (
              <button
                key={value}
                type="button"
                className={`chip chip-selectable${section.visibility === value ? ' chip-active' : ''}`}
                aria-pressed={section.visibility === value}
                onClick={() => {
                  update(section.id, { visibility: value });
                  void patch(section.id, { visibility: value });
                }}
              >
                {VISIBILITY_LABELS[value]}
              </button>
            ))}
          </div>

          {section.visibility === 'players' && (
            <div style={{ marginBottom: '0.5rem' }}>
              <RevealPicker
                users={users}
                cases={cases}
                value={section.revealedTo}
                label="Onthuld aan"
                onChange={(next) => {
                  update(section.id, { revealedTo: next });
                  void patch(section.id, { revealedTo: next });
                }}
              />
            </div>
          )}

          <SectionText
            section={section}
            user={liveUser}
            editable
            placeholder="Wat weet de Keeper hier nog meer over?"
            onChange={(doc) => void patch(section.id, { body: doc })}
          />
        </div>
      ))}
    </section>
  );
}
