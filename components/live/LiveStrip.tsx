'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { fill, type Words } from '@/lib/words';
import { goToSpotHere } from './LiveSpot';
import { useLiveBase } from './LiveProvider';
import { RosterPopover } from './RosterPopover';
import { SaveStatus } from './SaveStatus';
import { useSaveStatus } from './saveRegister';

/**
 * Ronde 65·herstel (review #15): how long a line may be on its way before the
 * strip says so. Every full page load starts `connecting`, and the line is
 * nearly always up within a few hundred ms — so the word flashed on every load
 * and said nothing. Under this the dot is neutral and wordless; past it, the
 * wait is real and the strip says *verbinden…*.
 */
export const CONNECTING_WORD_AFTER_MS = 1500;

/**
 * Golf M (A2): hoeveel schijfjes de strip draagt. Daarboven zegt hij `+n`,
 * zodat hij op elke breedte in de hoek past en nooit over de rand van het
 * venster loopt — een tafel van twaalf is vier schijfjes en een `+8`.
 */
export const STRIP_DISCS = 4;

/**
 * §21: the shell's own strip — who else is on this page, and whether the line
 * is up. The same coloured initials a board bar shows, in the same ink per
 * person, sitting in the top corner of every page.
 *
 * Golf M (A2): **one strip, top right, on every page** — the prikbord too,
 * whose own row of discs in its bar is gone (it had no roster, no *Kom
 * kijken*, and was hidden on a phone, so a phone on a prikbord saw nobody).
 * The per-sectie row under a live text on an artikel is gone as well: who is
 * here, and whether the line is up, is said once, here. `LivePage
 * presence={false}` still turns it off, and no page passes it any more.
 *
 * §60: it reads the *base* value, so a hand moving on the page does not
 * re-render it — and it knows a fourth word. `idle` is a tab that gave its
 * socket back because nobody was looking at it: nobody is shown and the dot
 * goes quiet, but it does not say "geen verbinding", because nothing is wrong
 * and the first glance brings the line straight back.
 *
 * §76: and now it is also a door. The discs still mean *ook hier* — the people
 * standing where you are — and the number beside them is everybody else in the
 * archive, which is the thing you could not see before. Pressing it opens "Wie
 * is er?".
 *
 * The strip stays the glance. Everything that needs a decision (where somebody
 * is, whether you may follow them there, asking them over) is in the popover,
 * because the corner of every page is not the place to read a list.
 */
export function LiveStrip({ words }: { words: Words }) {
  const live = useLiveBase();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const save = useSaveStatus();
  /* Review #15: *verbinden…* only once the line has been missing for a while. */
  const [slow, setSlow] = useState(false);
  const connecting = live.status === 'connecting';
  useEffect(() => {
    if (!connecting) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), CONNECTING_WORD_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [connecting]);

  /*
   * §100: a page with a strip of its own (a prikbord) turns the people and
   * the dot off — not the save word, which is the shell's and nobody else's.
   * What is left is the same corner with only that word in it.
   */
  if (live.stripHidden) {
    if (save.state === 'none') return null;
    return (
      <div className="live-strip live-strip-save-only">
        <SaveStatus words={words} />
      </div>
    );
  }
  const here = live.people;
  const status = live.status;
  const elsewhere = live.roster.rows.filter((row) => !row.self).length;
  const nudge = live.nudge;

  const title =
    status === 'live'
      ? here.length
        ? `Ook hier: ${here.map((p) => p.name).join(', ')}`
        : 'Live: wat iemand verandert zie je meteen'
      : status === 'offline'
        ? 'Geen verbinding — wijzigingen van anderen komen zodra de lijn terug is'
        : status === 'idle'
          ? 'Even stil — deze tab is op de achtergrond; de lijn komt terug zodra je kijkt'
          : 'Verbinden…';
  // Nothing is written beside the dot when the tab is merely resting: the word
  // there is for a line that is *wrong*, and an idle one is not.
  // And a line on its way is not wrong yet either (review #15): no word until
  // `CONNECTING_WORD_AFTER_MS` has passed without one.
  const word =
    status === 'live' ? 'live' : status === 'offline' ? 'geen verbinding' : status === 'idle' || !slow ? '' : 'verbinden…';

  return (
    <div className={`live-strip live-strip-${status}`} data-testid="live-strip" title={title}>
      {/* §100 (B14): the one save word, beside the dot — left of it, so that
          in a canvas's corner the strip grows away from the edge. */}
      <SaveStatus words={words} />
      <button
        type="button"
        ref={button}
        className="live-strip-open"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={words.presenceHeading}
        data-testid="roster-open"
        onClick={() => setOpen((was) => !was)}
      >
        {/* §96: on a computer the button says what it is — *Wie is er?*, the
            count, the dot — instead of an unlabelled 12 px circle (§85's
            leftover). Since golf M on a canvas too (the strip hangs in the band
            above its heading); never on a phone, where the corner is too narrow.
            The accessible name is the same word, so nothing reads it twice. */}
        <span className="live-strip-who" aria-hidden="true">
          {words.presenceHeading}
        </span>
        {here.length > 0 && (
          <span className="board-people" aria-label={`Ook hier: ${here.map((p) => p.name).join(', ')}`}>
            {here.slice(0, here.length > STRIP_DISCS ? STRIP_DISCS - 1 : STRIP_DISCS).map((person) => (
              <span key={person.clientId} className="board-person" style={{ background: person.colour }} title={person.name}>
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {here.length > STRIP_DISCS && (
              <span
                className="board-person board-person-more"
                title={fill(words.presenceMore, { n: String(here.length - (STRIP_DISCS - 1)) })}
              >
                +{here.length - (STRIP_DISCS - 1)}
              </span>
            )}
          </span>
        )}
        {elsewhere > 0 && (
          <span className="live-strip-count tiny" data-testid="roster-count">
            {elsewhere}
          </span>
        )}
        <span className={`live-dot live-dot-${status}`}>
          <span className="live-dot-mark" aria-hidden="true" />
          <span className="live-strip-word">{word}</span>
        </span>
      </button>

      {open && <RosterPopover words={words} onClose={() => setOpen(false)} opener={button} />}

      {/*
       * §76: an invitation. It is on the wire and nowhere else — not stored,
       * not queued for somebody who is out, and gone in two minutes whether it
       * is answered or not. Which is why it may live in the corner of the page
       * rather than in an inbox that would have to be built.
       */}
      {/*
       * Golf M (A4): an invitation you accept. *Ga* lands you where the asker
       * stands — their camera on a canvas, their sectie on an artikel — when
       * the server let the spot through for you (`spotForViewer`); otherwise
       * on the page. It is a real button now, not a small link.
       */}
      {nudge && (
        <div className="roster-nudge" role="status" data-testid="nudge">
          <span className="board-person roster-disc" style={{ background: nudge.colour }} aria-hidden="true">
            {nudge.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="small roster-nudge-text">
            <strong>{nudge.name}</strong> {words.nudgeAsks} <em>{nudge.label}</em>
            {nudge.detail && <span className="roster-detail"> · {nudge.detail}</span>}
          </span>
          {nudge.href && (
            <Link
              href={nudge.href}
              className="btn btn-small btn-primary roster-nudge-go"
              data-testid="nudge-go"
              onClick={(event) => {
                live.dismissNudge();
                if (goToSpotHere(nudge.href!)) event.preventDefault();
              }}
            >
              {words.nudgeGo}
            </Link>
          )}
          <button
            type="button"
            className="roster-nudge-no"
            onClick={() => live.dismissNudge()}
            aria-label={words.nudgeNoFollow}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
