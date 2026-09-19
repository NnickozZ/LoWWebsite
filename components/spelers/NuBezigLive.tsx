'use client';

import Link from 'next/link';
import { relativeTime } from '@/lib/diff';
import { useLiveBaseOptional } from '@/components/live/LiveProvider';
import type { RosterVerb } from '@/lib/live/rosterWire';
import type { Words } from '@/lib/words';

/**
 * §77, panel 1's live half: where this person is, right now.
 *
 * It reads the roster the shell already has (§76) rather than asking the server
 * anything of its own — the frame is on this screen, it was built for this
 * viewer, and every rule about what may be named is already in it. So this file
 * has no rights logic at all, and cannot acquire any: it matches rows by the
 * spelerspagina they point at, which is the one field of a row that says *whose
 * window this is* without carrying an account id (`hub.ts`).
 *
 * One person can be two rows — §18b, two onderzoekers in two windows — so it
 * prints all of them rather than picking one and being wrong on the evening
 * that matters.
 */

const VERB_WORD: Record<RosterVerb, string> = {
  kijkt: 'verbLooking',
  typt: 'verbTyping',
  tekent: 'verbDrawing',
  sleept: 'verbDragging',
};

export function NuBezigLive({ href, words, fallback }: { href: string; words: Words; fallback: string }) {
  const live = useLiveBaseOptional();
  const rows = (live?.roster.rows ?? []).filter((row) => row.speler === href);
  const earlier = (live?.roster.tail ?? []).find((row) => row.speler === href);

  if (!rows.length) {
    return (
      <p className="small muted" style={{ margin: 0 }} data-testid="nu-bezig-live">
        {earlier ? `${words.presenceEarlier}: ${relativeTime(Math.floor(earlier.at / 1000))}` : fallback}
      </p>
    );
  }

  return (
    <ul className="speler-nu-list" data-testid="nu-bezig-live">
      {rows.map((row) => {
        const verb = words[VERB_WORD[row.verb]] ?? row.verb;
        const trailing = row.resting ? words.presenceResting : row.mode === 'quiet' ? null : verb;
        return (
          <li key={row.id} className="small">
            <span className="board-person roster-disc" style={{ background: row.colour }} aria-hidden="true">
              {row.name.slice(0, 1).toUpperCase()}
            </span>{' '}
            <strong>{row.name}</strong>{' '}
            {row.mode === 'place' && row.href ? (
              <Link href={row.href}>{row.label}</Link>
            ) : row.mode === 'quiet' ? (
              <span className="muted">{words.presenceKeeperHere}</span>
            ) : (
              <em className="muted">{words.presenceElsewhere}</em>
            )}
            {trailing && <span className="muted"> · {trailing}</span>}
          </li>
        );
      })}
    </ul>
  );
}
