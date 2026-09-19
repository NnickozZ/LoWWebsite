'use client';

import Link from 'next/link';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { useDismiss } from '@/components/ui/useDismiss';
import { relativeTime } from '@/lib/diff';
import type { RosterRow, RosterVerb } from '@/lib/live/rosterWire';
import type { Words } from '@/lib/words';
import { useLiveBase } from './LiveProvider';

/**
 * §76: "Wie is er?" — the roster, hanging under the strip.
 *
 * A popover and not a `Sheet` (§69): the page underneath stays live, you
 * dismiss it by walking away from it, and `useDismiss` owns Escape and the
 * press outside. It is therefore **not portalled** — a portalled panel would
 * fail that hook's `contains` test, as `MentionPopover` explains at length.
 *
 * Everything on a row was decided on the server. This file must never look at
 * a `label` and decide whether to show it: a row that this viewer may not
 * follow arrives as `mode: 'hidden'` with nothing in it, and the placeholder is
 * one constant sentence for every kind of hidden thing. Reading rights in the
 * browser is reading them in the one place that cannot check them.
 *
 * Three things a row can be, and the middle one is the whole of §76:
 *
 *   place   a link. Clicking it puts you where they are.
 *   hidden  "ergens anders in het archief", and **not a link**. A row that
 *           navigated into a 403 would answer the question the row just
 *           refused to answer.
 *   quiet   the Keeper, seen by a player: a name and "is er".
 */

const VERB_WORD: Record<RosterVerb, string> = {
  kijkt: 'verbLooking',
  typt: 'verbTyping',
  tekent: 'verbDrawing',
  sleept: 'verbDragging',
};

export function RosterPopover({
  words,
  onClose,
  opener,
}: {
  words: Words;
  onClose: () => void;
  opener: RefObject<HTMLElement | null>;
}) {
  const live = useLiveBase();
  const panel = useRef<HTMLDivElement>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  useDismiss({ open: true, onDismiss: onClose, ref: panel, opener });

  const { rows, tail } = live.roster;
  const me = rows.find((row) => row.self);
  const others = rows.filter((row) => !row.self);

  const ask = useCallback(
    async (row: RosterRow) => {
      const answer = await live.sendNudge(row.id);
      const message =
        answer === 'ok'
          ? 'gevraagd'
          : answer === 'refused'
            ? words.nudgeRefused
            : answer === 'soon'
              ? 'zojuist al'
              : answer === 'nowhere'
                ? 'je staat nergens'
                : 'niet gelukt';
      setSaid((current) => ({ ...current, [row.id]: message }));
      setTimeout(() => setSaid((current) => ({ ...current, [row.id]: '' })), 4000);
    },
    [live, words.nudgeRefused],
  );

  return (
    <div className="roster-pop" ref={panel} role="dialog" aria-label={words.presenceHeading} data-testid="roster">
      <p className="roster-head">{words.presenceHeading}</p>

      {others.length === 0 && <p className="roster-alone small muted">{words.presenceAlone}</p>}

      <ul className="roster-list">
        {me && <Row key={me.id} row={me} words={words} onAsk={null} said="" />}
        {others.map((row) => (
          <Row key={row.id} row={row} words={words} onAsk={ask} said={said[row.id] ?? ''} />
        ))}
      </ul>

      {tail.length > 0 && (
        <>
          <p className="roster-rule">{words.presenceEarlier}</p>
          <ul className="roster-list roster-tail">
            {tail.map((row) => (
              <li key={row.id} className="roster-row roster-row-tail">
                <span className="board-person roster-disc" style={{ background: row.colour }} aria-hidden="true">
                  {row.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="roster-body">
                  {row.speler ? (
                    <Link href={row.speler} className="roster-name" title={row.account} onClick={onClose}>
                      {row.name}
                    </Link>
                  ) : (
                    <span className="roster-name" title={row.account}>
                      {row.name}
                    </span>
                  )}
                  {/* The tail never carries a place: where somebody was is not
                      where anybody is, and a link there sends you nowhere. */}
                  <span className="roster-where tiny muted">{relativeTime(Math.floor(row.at / 1000))}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {me?.isKeeper && (
        <label className="roster-ghost small">
          <input
            type="checkbox"
            checked={live.invisible}
            onChange={(event) => live.setInvisible(event.target.checked)}
          />{' '}
          {words.presenceInvisible}
        </label>
      )}
    </div>
  );
}

function Row({
  row,
  words,
  onAsk,
  said,
}: {
  row: RosterRow;
  words: Words;
  onAsk: ((row: RosterRow) => void) | null;
  said: string;
}) {
  const verb = words[VERB_WORD[row.verb]] ?? row.verb;
  const where =
    row.mode === 'place' ? (
      row.label
    ) : row.mode === 'quiet' ? (
      words.presenceKeeperHere
    ) : (
      <em>{words.presenceElsewhere}</em>
    );
  const trailing = row.resting ? words.presenceResting : row.mode === 'quiet' ? null : verb;

  const name = (
    <>
      {row.name}
      {row.self && <span className="tiny muted"> (jij)</span>}
      {row.ghost && <span className="tiny muted"> · {words.presenceInvisible}</span>}
    </>
  );

  const place = (
    <>
      {where}
      {trailing && <> · {trailing}</>}
      {row.elsewhere > 0 && (
        <>
          {' '}
          <span title={words.presenceOtherTabs}>+{row.elsewhere}</span>
        </>
      )}
    </>
  );

  return (
    <li
      className={`roster-row${row.resting ? ' roster-row-rest' : ''}`}
      data-mode={row.mode}
      data-testid="roster-row"
    >
      <span className="board-person roster-disc" style={{ background: row.colour }} aria-hidden="true">
        {row.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="roster-body">
        {/*
         * §77: two doors on one row, and they go to different places. The name
         * is *who they are* — their spelerspagina, which is where the kamer and
         * whatever else grows will hang. The line under it is *where they are*.
         * Keeping them apart is what stops the row meaning two things at once.
         */}
        {row.speler ? (
          <Link href={row.speler} className="roster-name roster-who" title={row.account}>
            {name}
          </Link>
        ) : (
          <span className="roster-name" title={row.account}>
            {name}
          </span>
        )}
        {/*
         * §76, rule 2: a place this person may not enter is not a link at all.
         * Letting the click through and meeting the page's own 403 would say
         * that the thing exists — which is exactly what the row refuses to say.
         */}
        {row.href ? (
          <Link href={row.href} className="roster-where roster-body-link tiny muted">
            {place}
          </Link>
        ) : (
          <span className="roster-where tiny muted" aria-disabled="true">
            {place}
          </span>
        )}
      </span>
      {onAsk && !row.resting && (
        <button
          type="button"
          className="roster-ask tiny"
          onClick={() => onAsk(row)}
          title={words.nudge}
          data-nudge-state={said ? said : 'rust'}
        >
          {said || words.nudge}
        </button>
      )}
    </li>
  );
}
