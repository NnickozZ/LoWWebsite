'use client';

import type { LivePerson, LiveStatus } from './useLiveDoc';

/**
 * §20: who else has this text open — the same row of coloured initials a
 * board shows, with a word for the state of the line. Names come from the
 * character each person is wearing (§18); the ink is their account's.
 */
export function LivePeople({ others, status }: { others: LivePerson[]; status: LiveStatus }) {
  return (
    <span className="row" style={{ gap: '0.4rem' }}>
      {others.length > 0 && (
        <span className="board-people" aria-label={`Ook hier: ${others.map((p) => p.name).join(', ')}`} title={others.map((p) => p.name).join(', ')}>
          {others.slice(0, 5).map((person) => (
            <span key={person.key} className="board-person" style={{ background: person.colour }} title={person.name}>
              {person.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          {others.length > 5 && <span className="board-person board-person-more">+{others.length - 5}</span>}
        </span>
      )}
      <span className={`live-dot live-dot-${status}`} title={status === 'live' ? 'Live: wat je typt ziet iedereen meteen' : status === 'offline' ? 'Geen verbinding — wat je typt wordt bewaard en straks doorgestuurd' : 'Verbinden…'}>
        <span className="live-dot-mark" aria-hidden="true" />
        {status === 'live' ? 'live' : status === 'offline' ? 'geen verbinding' : 'verbinden…'}
      </span>
    </span>
  );
}
