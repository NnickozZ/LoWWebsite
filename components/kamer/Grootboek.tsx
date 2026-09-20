import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/diff';
import type { LedgerLine } from '@/lib/kamers/service';
import { isPlekKind } from '@/lib/kamers/shape';
import { capitalise, type Words } from '@/lib/words';
import { GrantForm } from './GrantForm';
import { munt, plekWord } from './plekWords';

/**
 * §79/§83: the grootboek, and the line being written at the bottom of it.
 *
 * Below the grid, because the shelf is what a kamer is for and the ledger is
 * how it got there.
 *
 * §79 kept the whole thing for the Keeper. Nick, ronde 44: *"Spelers mogen het
 * 'grootboek' ook wel kunnen inzien."* — so everybody who may see the kamer
 * reads it, and **the door at the bottom is what stayed the Keeper's**. That
 * split lives here rather than on the page: the list and the form are one
 * thing, and a page that had to remember to pass one without the other is a
 * page that will forget.
 *
 * A line may be **veiled** (§83, and §76's rule again): an `item` line carries
 * the name of the artikel that was bought, and somebody who may stand in this
 * kamer but not see that artikel would read its name here. `ledgerOf` decides
 * it; this prints `words.slotVeiled` — the same sentence the plek itself uses,
 * because a different one would be the tell.
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
  if (line.veiled) return words.slotVeiled;
  if (line.kind === 'slot') {
    const kind = isPlekKind(line.reason) ? plekWord(line.reason, words) : line.reason;
    return `${capitalise(words.slot)}: ${kind}`;
  }
  return line.reason.trim() || '—';
}

export function Grootboek({
  roomId,
  lines,
  canGrant,
  words,
}: {
  roomId: string;
  lines: LedgerLine[];
  /** §83: may this hand write a line? The Keeper's, and only his. */
  canGrant: boolean;
  words: Words;
}) {
  return (
    <section className="kamer-grootboek" data-testid="kamer-grootboek" aria-labelledby="kamer-grootboek-title">
      <h2 id="kamer-grootboek-title" className="kamer-grootboek-title">
        {words.ledger}
        {/*
          §83: de deur naar de uitdeler, en hij staat hier omdat dit de plek is
          waar een Keeper toch al munten aan het geven is. Alleen voor hem —
          `canGrant` is precies dezelfde vraag als de poort op `/uitdelen`.
        */}
        {canGrant && (
          <Link className="btn btn-small kamer-grootboek-uitdelen" href="/uitdelen" data-testid="grootboek-uitdelen">
            <Icon name="person" size={13} />
            {words.handout}
          </Link>
        )}
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
              data-veiled={line.veiled ? 'ja' : 'nee'}
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

      {canGrant && <GrantForm roomId={roomId} give={words.ledgerGive} why={words.ledgerWhy} />}
    </section>
  );
}
