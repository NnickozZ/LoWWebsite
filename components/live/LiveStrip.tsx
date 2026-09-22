'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { Words } from '@/lib/words';
import { useLiveBase } from './LiveProvider';
import { RosterPopover } from './RosterPopover';

/**
 * §21: the shell's own strip — who else is on this page, and whether the line
 * is up. The same coloured initials a board bar shows, in the same ink per
 * person, sitting in the top corner of every page. A page with a strip of its
 * own (a prikbord) turns this one off through `LivePage presence={false}`.
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

  if (live.stripHidden) return null;
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
  const word = status === 'live' ? 'live' : status === 'offline' ? 'geen verbinding' : status === 'idle' ? '' : 'verbinden…';

  return (
    <div className={`live-strip live-strip-${status}`} data-testid="live-strip" title={title}>
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
            leftover). Not on a canvas, whose heading keeps room for the strip
            as it was; and never on a phone, where the corner is too narrow.
            The accessible name is the same word, so nothing reads it twice. */}
        <span className="live-strip-who" aria-hidden="true">
          {words.presenceHeading}
        </span>
        {here.length > 0 && (
          <span className="board-people" aria-label={`Ook hier: ${here.map((p) => p.name).join(', ')}`}>
            {here.slice(0, 6).map((person) => (
              <span key={person.clientId} className="board-person" style={{ background: person.colour }} title={person.name}>
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {here.length > 6 && <span className="board-person board-person-more">+{here.length - 6}</span>}
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
      {nudge && (
        <div className="roster-nudge" role="status" data-testid="nudge">
          <span className="board-person roster-disc" style={{ background: nudge.colour }} aria-hidden="true">
            {nudge.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="small">
            <strong>{nudge.name}</strong> {words.nudgeAsks} <em>{nudge.label}</em>
          </span>
          {nudge.href && (
            <Link href={nudge.href} className="roster-nudge-go small" onClick={() => live.dismissNudge()}>
              Ga
            </Link>
          )}
          <button type="button" className="roster-nudge-no" onClick={() => live.dismissNudge()} aria-label="Wegklikken">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
