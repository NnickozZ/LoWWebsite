'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { relativeTime } from '@/lib/diff';
import type { LedgerLine } from '@/lib/kamers/service';
import { isPlekKind } from '@/lib/kamers/shape';
import { capitalise, fill, type Words } from '@/lib/words';
import { GrantForm } from './GrantForm';
import { MEANING, munt, plekWord } from './plekWords';

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
 *
 * **§85 made every line a sentence.** They were field names with colons —
 * `Plek: plank` for an opened plek, a bare artikel name for a purchase, and
 * for a grant whatever the Keeper had typed, with an em dash when that was
 * nothing. Three different shapes, none of which said what had *happened*: a
 * grootboek is a list of events and it read as a table of values. Now the
 * three are three sentences (`{plek} geopend`, `{ding} gekocht`, `Van de
 * {keeper}: {reden}`), all three the Keeper's to rewrite, and the fourth —
 * the veiled one — is untouched on purpose: §76's rule is that every veiled
 * thing says the *same* sentence, and giving this one a shape of its own would
 * make it tellable from the others.
 */
function reasonOf(line: LedgerLine, words: Words): string {
  if (line.veiled) return words.slotVeiled;
  if (line.kind === 'slot') {
    const kind = isPlekKind(line.reason) ? plekWord(line.reason, words) : line.reason;
    return capitalise(fill(words.ledgerSlotLine, { plek: kind }));
  }
  if (line.kind === 'item') {
    return capitalise(fill(words.ledgerItemLine, { ding: line.reason.trim() }));
  }
  const why = line.reason.trim();
  return why
    ? fill(words.ledgerFrom, { keeper: words.keeper, reden: why })
    : fill(words.ledgerFromPlain, { keeper: words.keeper });
}

/** Hoeveel regels er zonder vragen staan. De lijst komt al op volgorde binnen
    (`ledgerOf`, nieuwste eerst), dus dit zijn de laatste drie dingen die er
    gebeurd zijn — precies wat iemand na een avond nog wil nakijken. */
const LEDGER_SHOWN = 3;

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
  const [open, setOpen] = useState(false);
  const shown = open ? lines : lines.slice(0, LEDGER_SHOWN);

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
            <Icon name={MEANING.geven} size={13} />
            {words.handout}
          </Link>
        )}
      </h2>

      {lines.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          {words.ledgerEmpty}
        </p>
      ) : (
        <ul className="kamer-grootboek-list" aria-label={words.ledger}>
          {shown.map((line) => (
            <li
              key={line.id}
              className="kamer-grootboek-row"
              data-testid="grootboek-regel"
              data-delta={line.delta}
              data-kind={line.kind}
              data-veiled={line.veiled ? 'ja' : 'nee'}
            >
              {/*
                §85: een bedrag in het grootboek is geen stempel meer.
                
                Het was een `.stamp` — rood, gedraaid, omlijnd — en dat is in dit
                archief de vorm van een *prijs* (§84 zette dat vast toen het saldo
                zijn eigen vorm kreeg). Een regel in het grootboek is geen prijs:
                hij is wat er gebeurd is. Drie rode kaartjes onder elkaar, waarvan
                één "+4" zegt, lezen bovendien alle drie als een waarschuwing.
                Nu: erbij in gewone inkt en vet, eraf gedempt, en niets rood.
              */}
              <span className={`kamer-delta${line.delta < 0 ? ' kamer-delta-out' : ''}`}>
                {line.delta > 0 ? '+' : ''}
                {munt(line.delta, words)}
              </span>
              <span className="small kamer-grootboek-why">{reasonOf(line, words)}</span>
              <span className="tiny muted kamer-grootboek-when">{relativeTime(line.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      {/*
        §85: het boek staat ingeklapt op de laatste drie regels.
        
        Een kamer van een half jaar oud heeft er vijftig, en `ledgerOf` haalt
        er vijftig op — dus stond er onder elke kamer een lijst die vier keer
        zo lang was als de kamer zelf, met bovenaan de enige drie regels die
        iemand nog leest. Dit is een gemak en geen recht: de knop haalt niets
        op en verbergt niets voor wie hij niet bedoeld is (de sluier van §76
        zit in `ledgerOf`, niet hier), dus hij mag in de browser wonen.
      */}
      {lines.length > LEDGER_SHOWN && (
        <button
          type="button"
          className="btn btn-ghost btn-small kamer-grootboek-meer"
          data-testid="grootboek-meer"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? words.ledgerFewer : words.ledgerAll}
        </button>
      )}

      {canGrant && <GrantForm roomId={roomId} give={words.ledgerGive} why={words.ledgerWhy} />}
    </section>
  );
}
