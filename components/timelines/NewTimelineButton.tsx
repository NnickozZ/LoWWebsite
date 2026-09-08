'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
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
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // §48: which side it is born on — see `NewBoardButton` for why a dossier of
  // the Keeper's takes the choice away.
  const here = ui.caseHere && ui.caseHere.id === caseId ? ui.caseHere : null;
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  async function create(isPrivate: boolean) {
    setBusy(isPrivate ? 'private' : 'public');
    try {
      const response = await fetch('/api/timelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || (isPrivate ? `Privé ${words.timeline}` : `Nieuwe ${words.timeline}`),
          caseId,
          scale,
          isPrivate,
          // §48: ignored for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        ui.toast(data.error ?? `Nieuwe ${words.timeline} aanmaken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { timeline: { slug: string } };
      setOpen(false);
      router.push(`/timelines/${data.timeline.slug}`);
    } catch {
      ui.toast('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen(true)}>
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
            <div className="row-wrap" style={{ gap: '0.4rem' }}>
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
