'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { RichEditor } from '@/components/editor/RichEditor';
import { useUi } from '@/components/ui/UiProvider';
import type { Visibility } from '@/lib/db/schema';
import { RevealPicker, type RevealableCase, type RevealableUser } from './RevealPicker';

export type SectionLite = {
  id: string;
  title: string;
  body: unknown;
  visibility: Visibility;
  revealedTo: string[];
};

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
}: {
  entryId: string;
  sections: SectionLite[];
  isKeeper: boolean;
  users: RevealableUser[];
  cases: RevealableCase[];
}) {
  const ui = useUi();
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [busy, setBusy] = useState(false);

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

  if (!isKeeper) {
    // Read-only: the sections a player may see, in order, as part of the entry.
    if (!sections.length) return null;
    return (
      <>
        {sections.map((section) => (
          <section key={section.id} className="entry-section">
            <h2 className="entry-section-title">{section.title || 'Zonder titel'}</h2>
            <RichEditor initialDoc={section.body} editable={false} onChange={() => {}} />
          </section>
        ))}
      </>
    );
  }

  return (
    <section className="entry-sections">
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Secties</h2>
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
        <div key={section.id} className="entry-section entry-section-editing">
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

          <RichEditor
            initialDoc={section.body}
            placeholder="Wat weet de Keeper hier nog meer over?"
            onChange={(doc) => void patch(section.id, { body: doc })}
          />
        </div>
      ))}
    </section>
  );
}
