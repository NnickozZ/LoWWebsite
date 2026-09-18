'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SectionsEditor, type SectionLite } from '@/components/entry/SectionsEditor';
import type { RevealableCase, RevealableUser } from '@/components/entry/RevealPicker';
import type { LiveUser } from '@/components/editor/useLiveDoc';
import { MentionOverlay, MentionPopover, MentionRow, MentionText } from '@/components/ui/MentionPopover';
import { useUi } from '@/components/ui/UiProvider';

export type OverzichtLite = {
  id: string;
  name: string;
  slug: string;
  lead: string;
  isHome: boolean;
  icon: string;
  href: string;
};

/**
 * §75: een overzicht, op het scherm.
 *
 * Deliberately the thinnest page in the archive, and the list of what it does
 * *not* have is the design:
 *
 *  - **no infobox and no rail.** `.overzicht-page` is one column across the
 *    whole width. An overzicht has no fields, no cover and no tags, so there is
 *    nothing to put in a sidebar — which is exactly what Nick asked for, and
 *    the reason a reader's eye goes to the links rather than to a card of
 *    facts about a page that is not about anything.
 *  - **no editor of its own.** The body is §70's secties, unchanged: the same
 *    component, the same rooms, the same rights, the same per-sectie
 *    geheimhouding. Only the two lines of wording differ.
 *  - **no `router.refresh()` dance.** Nothing here is a canvas; the page is
 *    server-rendered and `LivePage` brings changes in.
 *
 * The two faces are the archive's own (§22, rule 18): everybody lands reading,
 * and `.entry-mode-toggle` is the one control that changes that — the same
 * class the artikel and the dossier use, so `editArticle()` in the e2e helpers
 * works here without learning a new name.
 */
export function OverzichtView({
  overzicht,
  siblings,
  sections,
  canEdit,
  isKeeper,
  users,
  cases,
  liveUser,
  defaultLead,
}: {
  overzicht: OverzichtLite;
  /** The other overzichten, for the strip — how a new one is found at all. */
  siblings: OverzichtLite[];
  sections: SectionLite[];
  canEdit: boolean;
  isKeeper: boolean;
  users: RevealableUser[];
  cases: RevealableCase[];
  liveUser: LiveUser | null;
  /**
   * What the front door says while nobody has written anything: the archive
   * introducing itself, from `lib/intro.ts`, so the words follow §11's list and
   * the text lives in one place rather than being frozen into a migration.
   * Shown, never stored — the first person to type replaces it for good.
   */
  defaultLead?: string;
}) {
  const ui = useUi();
  const router = useRouter();
  const [reading, setReading] = useState(true);
  const [name, setName] = useState(overzicht.name);
  const [lead, setLead] = useState(overzicht.lead);
  const leadRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);

  async function save(patch: { name?: string; lead?: string }) {
    const response = await fetch(`/api/overzichten/${overzicht.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) ui.toast('Opslaan is niet gelukt.');
  }

  async function remove() {
    const sure = await ui.confirm({
      title: `‘${name}’ weggooien?`,
      message: `Het gaat naar de prullenbak van de ${ui.words.keeper}. De ${ui.words.entryPlural} waar het naar wijst blijven gewoon staan.`,
      confirmLabel: 'Weggooien',
      danger: true,
    });
    if (!sure) return;
    setBusy(true);
    const response = await fetch(`/api/overzichten/${overzicht.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      ui.toast('Weggooien is niet gelukt.');
      return;
    }
    ui.toast(`‘${name}’ weggegooid.`);
    router.push('/wiki');
  }

  // The lead a reader sees: what somebody wrote, or the archive's own words
  // while nobody has. Never both.
  const shownLead = lead.trim() || (overzicht.isHome ? (defaultLead ?? '') : '');

  return (
    <div className="overzicht-page">
      <div className="row" style={{ marginBottom: '0.3rem' }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          {overzicht.isHome ? 'De wiki' : ui.words.overzicht}
        </p>
        <div className="spacer" />
        {canEdit && !reading && !overzicht.isHome && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => void remove()} disabled={busy}>
            <Icon name="trash" size={14} />
            Weggooien
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className={`btn btn-small entry-mode-toggle${reading ? '' : ' entry-mode-toggle-on'}`}
            aria-pressed={!reading}
            onClick={() => setReading((was) => !was)}
          >
            <Icon name={reading ? 'edit' : 'eye'} size={14} />
            {reading ? 'Bewerken' : 'Lezen'}
          </button>
        )}
      </div>

      {reading ? (
        <>
          <h1 className="entry-title">{name}</h1>
          {shownLead && (
            <p className="entry-lead">
              <MentionText text={shownLead} />
            </p>
          )}
        </>
      ) : (
        <>
          <label className="visually-hidden" htmlFor="overzicht-name">
            Naam van het {ui.words.overzicht}
          </label>
          <input
            id="overzicht-name"
            className="input entry-title-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={(event) => void save({ name: event.target.value })}
          />
          <div style={{ margin: '0.6rem 0 1rem' }}>
            <label className="label" htmlFor="overzicht-lead">
              Inleiding
            </label>
            {/* §54/§56: een gewoon tekstvak krijgt de lijst, de chip over de
                letters en de rij eronder — of dezelfde tekst is hier een chip
                en op het volgende scherm een paar haken. */}
            <textarea
              id="overzicht-lead"
              ref={leadRef}
              className="input"
              rows={3}
              value={lead}
              placeholder="Waar gaat dit deel van de wiki over? Wat moet iemand hier eerst lezen?"
              onChange={(event) => setLead(event.target.value)}
              onBlur={(event) => void save({ lead: event.target.value })}
            />
            <MentionPopover forRef={leadRef} />
            <MentionOverlay forRef={leadRef} value={lead} />
            <MentionRow text={lead} />
          </div>
        </>
      )}

      <SectionsEditor
        ownerKind="overzicht"
        ownerId={overzicht.id}
        sections={sections}
        isKeeper={isKeeper}
        canEdit={canEdit}
        readOnly={reading}
        users={users}
        cases={cases}
        liveUser={liveUser}
        emptyHint="Een sectie is een kop met tekst eronder — “Waar begin je?”, “De families van het eiland”, “Wat we nog niet weten”. Zet er met @ de artikelen in die erbij horen."
        bodyPlaceholder="Groepeer hier wat bij elkaar hoort, met een regel uitleg erbij."
      />

      {/*
        §75: de strip. Zonder deze rij is een nieuw overzicht alleen te vinden
        als iemand er met de hand naar linkt, en dan is het geen wegwijzer maar
        een verdwaalde pagina. Hij staat onderaan, want hij is de uitgang van
        deze pagina en niet de inhoud ervan.
      */}
      {siblings.length > 0 && (
        <nav className="overzicht-strip" aria-label={ui.words.overzichtPlural}>
          <p className="eyebrow" style={{ margin: '0 0 0.4rem' }}>
            Andere {ui.words.overzichtPlural}
          </p>
          <div className="row-wrap">
            {siblings.map((other) => (
              <Link key={other.id} className="chip chip-selectable" href={other.href}>
                <Icon name={other.icon} size={14} />
                {other.name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
