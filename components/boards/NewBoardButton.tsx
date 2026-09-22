'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SideChoice } from '@/components/keeper/SideChoice';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { freshHref } from '@/lib/canvas/memory';

/**
 * §17: a new prikbord — and since §69, through a sheet, like the other three.
 *
 * **What changed and why.** The wall was the odd one out among the four
 * container makers. A tijdlijn, a landkaart and a stamboom each ask for a name
 * in a sheet before they exist; the wall made itself on the press, called
 * "Nieuw prikbord", and left you to rename it on the canvas. That is one fewer
 * click, and it was the argument for keeping it — but it also meant a shelf of
 * walls all called the same thing, a name typed on a page you had already
 * navigated to, and a maker whose shape nobody could predict from the other
 * three. Nick's answer in round 35 was to converge on the majority.
 *
 * **What did not change.** The two buttons are still two buttons (§17): the
 * moment you make a wall is the moment you know whether it is for the camp or
 * for you, and a private wall that spent its first minute public is a leak. So
 * "Openbaar" and "Privé" keep their names and their place — they moved into the
 * sheet, they were not merged into one button with a tickbox.
 *
 * "Openbaar" is the archive's default: everyone may look and everyone may pin.
 * "Privé" sets both dials to the owner and the Keepers; they can be opened up
 * later, one dial at a time, from the board's own Rechten sheet.
 */
export function NewBoardButton({ caseId }: { caseId?: string } = {}) {
  const ui = useUi();
  const router = useRouter();
  const words = ui.words;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'public' | 'private' | null>(null);
  /* §69: the refusal stays in the sheet — see `NewTimelineButton` for why. */
  const [error, setError] = useState<string | null>(null);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  /*
   * §48: and a third question, for a Keeper: which side of the archive the
   * wall is hung on. It is not the same question as openbaar-of-privé — that
   * one is about which *players* may look, this one about whether the table
   * knows the wall exists at all. Inside a Keeper-only dossier there is no
   * choice: the wall carries the dossier's name into every list that shows it.
   */
  const here = ui.caseHere && ui.caseHere.id === caseId ? ui.caseHere : null;
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  async function create(isPrivate: boolean) {
    setBusy(isPrivate ? 'private' : 'public');
    setError(null);
    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // §69: what was typed, and the old default only when nothing was —
          // so a hand that presses straight through gets exactly what it used
          // to get, and the sheet costs that person nothing but a press.
          name: name.trim() || (isPrivate ? `Privé ${words.board}` : `Nieuw ${words.board}`),
          caseId,
          isPrivate,
          // §48: ignored for anyone who is not a Keeper.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      if (!response.ok) {
        // §69: the archive's own sentence where it has one. "Aanmaken is niet
        // gelukt" over the top of "Je mag hier niet schrijven" tells the person
        // nothing they can act on.
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Nieuw ${words.board} aanmaken is niet gelukt.`);
        return;
      }
      const data = (await response.json()) as { board: { id: string } };
      setOpen(false);
      // §94 (O1): een vlak dat je net maakte opent in Bewerken.
      router.push(freshHref(`/b/${data.board.id}`));
      // §69: the shelf behind this sheet is server-rendered, so the Back button
      // would otherwise land on a list from before this wall existed.
      router.refresh();
    } catch {
      // A `fetch` that rejects rather than answering means the archive did not
      // reply at all — the server is down or the connection dropped. Without
      // this the button simply did nothing, forever, with no explanation, which
      // is the worst way to learn that the server has died.
      setError('Geen verbinding met het archief. Probeer het zo opnieuw.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* §69: ask who is writing *before* the sheet, never over it. */}
      <button type="button" className="btn btn-primary btn-small" onClick={() => ui.openMaker(() => setOpen(true))}>
        <Icon name="plus" size={15} />
        {/* Inside a dossier there is only one wall worth making, and it is this
            dossier's — so the button says what it does rather than what its
            rights are. On the prikborden-pagina it says what it makes. */}
        {caseId ? `Maak nieuw ${words.board} voor dit ${words.case}` : `Nieuw ${words.board}`}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="new-board-title">
          <div className="stack">
            <h2 id="new-board-title" style={{ margin: 0 }}>
              Nieuw {words.board}
            </h2>
            <div>
              <label className="label" htmlFor="new-board-name">
                Naam
              </label>
              <input
                id="new-board-name"
                className="input"
                value={name}
                autoFocus
                placeholder="bijv. De nacht van 12 maart"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  // §69: Enter makes it openbaar, as on the other three.
                  if (event.key === 'Enter' && !busy) {
                    event.preventDefault();
                    void create(false);
                  }
                }}
              />
            </div>
            <p className="tiny muted" style={{ margin: 0 }}>
              Een {words.board} is een muur om {words.entryPlural}, notities en foto&rsquo;s op te prikken en met
              draadjes te verbinden.
            </p>
            <SideChoice
              show={ui.isKeeper}
              keeper={sideLocked || keeperSide}
              locked={sideLocked}
              lockedWhy={`${here?.name ?? `Dit ${words.case}`} is van de ${words.keeper}.`}
              onChange={setKeeperSide}
              words={words}
            />
            {error && <p className="error-note">{error}</p>}
            <div className="row-wrap" style={{ gap: '0.4rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => void create(false)}
                disabled={busy !== null}
                title="Iedereen mag kijken en prikken"
              >
                <Icon name="plus" size={15} />
                {caseId ? `${cap(words.board)} aanmaken` : `Openbaar ${words.board}`}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void create(true)}
                disabled={busy !== null}
                title="Alleen jij en de Keepers, tot je het openzet"
              >
                <Icon name="lock" size={14} />
                Privé {words.board}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
