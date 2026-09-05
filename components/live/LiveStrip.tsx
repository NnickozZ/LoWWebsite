'use client';

import { useLive } from './LiveProvider';

/**
 * §21: the shell's own strip — who else is on this page, and whether the line
 * is up. The same coloured initials a board bar shows, in the same ink per
 * person, sitting in the top corner of every page. A page with a strip of its
 * own (a prikbord) turns this one off through `LivePage presence={false}`.
 */
export function LiveStrip() {
  const live = useLive();
  if (live.stripHidden) return null;
  const others = live.people;
  const status = live.status;
  const title =
    status === 'live'
      ? others.length
        ? `Ook hier: ${others.map((p) => p.name).join(', ')}`
        : 'Live: wat iemand verandert zie je meteen'
      : status === 'offline'
        ? 'Geen verbinding — wijzigingen van anderen komen zodra de lijn terug is'
        : 'Verbinden…';

  return (
    <div className={`live-strip live-strip-${status}`} data-testid="live-strip" title={title}>
      {others.length > 0 && (
        <span className="board-people" aria-label={`Ook hier: ${others.map((p) => p.name).join(', ')}`}>
          {others.slice(0, 6).map((person) => (
            <span key={person.clientId} className="board-person" style={{ background: person.colour }} title={person.name}>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {others.length > 6 && <span className="board-person board-person-more">+{others.length - 6}</span>}
        </span>
      )}
      <span className={`live-dot live-dot-${status}`}>
        <span className="live-dot-mark" aria-hidden="true" />
        <span className="live-strip-word">{status === 'live' ? 'live' : status === 'offline' ? 'geen verbinding' : 'verbinden…'}</span>
      </span>
    </div>
  );
}
