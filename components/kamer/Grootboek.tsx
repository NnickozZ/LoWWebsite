import { relativeTime } from '@/lib/diff';
import type { LedgerLine } from '@/lib/kamers/service';
import { isPlekKind } from '@/lib/kamers/shape';
import { capitalise, type Words } from '@/lib/words';
import { GrantForm } from './GrantForm';
import { munt, plekWord } from './plekWords';

/**
 * §79: the grootboek, and the line being written at the bottom of it.
 *
 * Keeper-only, and below the grid, because the shelf is what a kamer is for
 * and the ledger is how it got there.
 *
 * **The balance is the sum of these lines and nothing else** (rule 2 of the
 * round), so this list is not a report *about* the number at the top of the
 * page — it is where that number comes from. A mistake is a line added, which
 * is why there is nothing here to edit and nothing to delete: the form at the
 * bottom takes a negative amount and that is the correction.
 *
 * A line that paid for a plek writes the plek's *kind key* as its reason
 * (`unlockSlot`), so it is read back through `lib/words.ts` like every other
 * kind on this page rather than printed raw.
 */
function reasonOf(line: LedgerLine, words: Words): string {
  if (line.kind === 'slot') {
    const kind = isPlekKind(line.reason) ? plekWord(line.reason, words) : line.reason;
    return `${capitalise(words.slot)}: ${kind}`;
  }
  return line.reason.trim() || '—';
}

export function Grootboek({
  roomId,
  lines,
  words,
}: {
  roomId: string;
  lines: LedgerLine[];
  words: Words;
}) {
  return (
    <section className="kamer-grootboek" data-testid="kamer-grootboek" aria-labelledby="kamer-grootboek-title">
      <h2 id="kamer-grootboek-title" className="kamer-grootboek-title">
        {words.ledger}
      </h2>

      {lines.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Nog geen regels.
        </p>
      ) : (
        <ul className="kamer-grootboek-list" aria-label={words.ledger}>
          {lines.map((line) => (
            <li
              key={line.id}
              className="kamer-grootboek-row"
              data-testid="grootboek-regel"
              data-delta={line.delta}
              data-kind={line.kind}
            >
              <span className={`stamp kamer-delta${line.delta < 0 ? ' kamer-delta-out' : ''}`}>
                {line.delta > 0 ? '+' : ''}
                {munt(line.delta, words)}
              </span>
              <span className="small kamer-grootboek-why">{reasonOf(line, words)}</span>
              <span className="tiny muted kamer-grootboek-when">{relativeTime(line.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <GrantForm roomId={roomId} give={words.ledgerGive} why={words.ledgerWhy} />
    </section>
  );
}
