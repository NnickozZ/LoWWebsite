'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { MentionOverlay, MentionPopover, MentionRow } from '@/components/ui/MentionPopover';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { SCALES, SCALE_HINTS, SCALE_LABELS, type Scale } from '@/lib/timelines/time';

/**
 * §32: a new tijdlijn. Unlike a prikbord it asks one question before it
 * exists — what it is measured in — because that decides what every
 * gebeurtenis on it is asked for, and a tijdlijn of a single night measured
 * in years is a tijdlijn with one tick on it. It can be changed afterwards
 * in the tijdlijn's own settings.
 *
 * The public-or-private choice is the prikbord's (§17), for the same reason:
 * a private tijdlijn that spent its first minute public is a leak.
 */
export function NewTimelineButton({ caseId }: { caseId?: string } = {}) {
  const ui = useUi();
  const router = useRouter();
  const words = ui.words;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scale, setScale] = useState<Scale>('day');
  /* §69 (4.8): de omschrijving, in de vorm van de landkaart. */
  const [description, setDescription] = useState('');
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  /*
   * §69: the refusal stays in the sheet, beside the button that caused it. A
   * toast over an open sheet is behind the person's eyes and gone in four
   * seconds, and the sheet it is about is still standing — the landkaart's
   * sheet has always said it this way and now the other three do too.
   */
  const [error, setError] = useState<string | null>(null);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // §48: which side it is born on — see `NewBoardButton` for why a dossier of
  // the Keeper's takes the choice away.
  const here = ui.caseHere && ui.caseHere.id === caseId ? ui.caseHere : null;
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  async function create(isPrivate: boolean) {
    setBusy(isPrivate ? 'private' : 'public');
    setError(null);
    try {
      const response = await fetch('/api/timelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || (isPrivate ? `Privé ${words.timeline}` : `Nieuwe ${words.timeline}`),
          caseId,
          scale,
          isPrivate,
          // §69 (4.8): the route already took one; only the maker never asked.
          description: description.trim(),
          // §48: ignored for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Nieuwe ${words.timeline} aanmaken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { timeline: { slug: string } };
      setOpen(false);
      router.push(`/timelines/${data.timeline.slug}`);
      // §69: the shelf behind this sheet is server-rendered — without this the
      // Back button lands on the list from before this tijdlijn existed.
      router.refresh();
    } catch {
      setError('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* §69: ask who is writing *before* the sheet, never over it. */}
      <button type="button" className="btn btn-primary btn-small" onClick={() => ui.openMaker(() => setOpen(true))}>
        <Icon name="plus" size={15} />
        {caseId ? `Maak nieuwe ${words.timeline} voor dit ${words.case}` : `Nieuwe ${words.timeline}`}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="new-timeline-title">
          <div className="stack">
            <h2 id="new-timeline-title" style={{ margin: 0 }}>
              Nieuwe {words.timeline}
            </h2>
            <div>
              <label className="label" htmlFor="new-timeline-name">
                Naam
              </label>
              <input
                id="new-timeline-name"
                className="input"
                value={name}
                autoFocus
                placeholder={`bijv. De nacht van 12 maart`}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy) {
                    event.preventDefault();
                    void create(false);
                  }
                }}
              />
            </div>
            {/*
              §69 (4.8): één omschrijvingsveld, in de vorm die de landkaart al
              had. Een `label`, een `textarea` van twee regels, en de drie
              `@`-delen die overal bij elkaar horen: de lijst terwijl je typt,
              de chip over de letters in het vak zelf (§56), en de rij eronder
              die klikbaar is (§54). Drie van de vier makers vroegen hier
              helemaal niets, terwijl de kolom er al was — een tijdlijn kon dus
              alleen een omschrijving krijgen door hem ergens anders te gaan
              bewerken.
            */}
            <div>
              <label className="label" htmlFor="new-timeline-description">
                Omschrijving
              </label>
              <textarea
                id="new-timeline-description"
                ref={descriptionRef}
                className="input"
                rows={2}
                value={description}
                placeholder="Waar gaat deze tijdlijn over?"
                onChange={(event) => setDescription(event.target.value)}
              />
              <MentionPopover forRef={descriptionRef} />
              <MentionOverlay forRef={descriptionRef} value={description} />
              <MentionRow text={description} />
            </div>
            <fieldset className="timeline-scale-picker">
              <legend className="label">Gemeten in</legend>
              {SCALES.map((option) => (
                <label key={option} className={`timeline-scale-option${scale === option ? ' timeline-scale-option-on' : ''}`}>
                  {/*
                   * The measure is the name of this choice; the line under it
                   * is what the choice *means*. Without saying so the two run
                   * together into one accessible name — "Seconden. Tot op de
                   * seconde. De laatste twee minuten." is then a radio called
                   * "minuten" as much as the one above it is — so the name is
                   * the word and the sentence is its description.
                   */}
                  <input
                    type="radio"
                    name="new-timeline-scale"
                    value={option}
                    checked={scale === option}
                    onChange={() => setScale(option)}
                    aria-label={SCALE_LABELS[option]}
                    aria-describedby={`new-timeline-scale-${option}-hint`}
                  />
                  <span>
                    <strong>{SCALE_LABELS[option]}</strong>
                    <span className="tiny muted" id={`new-timeline-scale-${option}-hint`} style={{ display: 'block' }}>
                      {SCALE_HINTS[option]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="tiny muted" style={{ margin: 0 }}>
              De maat is later te veranderen in de instellingen van de {words.timeline}.
            </p>
            <SideChoice
              show={ui.isKeeper}
              keeper={sideLocked || keeperSide}
              locked={sideLocked}
              lockedWhy={`${here?.name ?? `Dit ${words.case}`} is van de ${words.keeper}.`}
              onChange={setKeeperSide}
              words={words}
            />
            {error && <p className="error-note">{error}</p>}
            {/* §90: on a phone this row sticks to the bottom of the sheet, so
                the button that makes the tijdlijn is on screen without
                scrolling (it was at y 862 of 844, under the keyboard). */}
            <div className="row-wrap sheet-actions-stick" style={{ gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={busy !== null}
                onClick={() => void create(false)}
                title="Iedereen mag kijken en gebeurtenissen zetten"
              >
                <Icon name="plus" size={15} />
                {caseId ? `${cap(words.timeline)} aanmaken` : `Openbare ${words.timeline}`}
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={busy !== null}
                onClick={() => void create(true)}
                title="Alleen jij en de Keepers, tot je het openzet"
              >
                <Icon name="lock" size={14} />
                Privé {words.timeline}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
