'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Thumb } from '@/components/Cover';
import { Sheet } from '@/components/ui/Sheet';
import { useUi } from '@/components/ui/UiProvider';
import { SUGGEST_DEBOUNCE_MS } from '@/lib/search/suggest';
import type { CatalogueEntry } from '@/lib/kamers/service';
import type { PlekKind } from '@/lib/kamers/shape';
import { capitalise, fill, type Words } from '@/lib/words';
import { Beurs } from './Beurs';
import { MEANING, munt, plekWord, shortfall, withPrice } from './plekWords';
import { kamerPost } from './post';

type Voorwerp = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

/** The two halves of the sheet. `bezit` is what you own; `catalogus` is what is for sale. */
type Tab = 'bezit' | 'catalogus';

/**
 * §79/§80: putting something in a plek — and, since §80, buying it.
 *
 * The same shape as every other picker in the archive — a sheet, one box, a
 * debounced ask, a list of rows you tap (`AddToCaseButton`, `EntryPicker`,
 * the prikbord's search) — and deliberately so: this is the fourth or fifth
 * time somebody searches the wiki from inside something else, and a fifth
 * invention would be a fifth set of habits to learn.
 *
 * **Two tabs, one sheet, and that is the whole of §80's front door.** Standing
 * in front of an empty plank there are exactly two questions — *what have I
 * got that fits here* and *what is there to get* — and they are the same
 * gesture with the same rows and the same rights. A second button beside
 * "Neerzetten" would have been a second thing to learn for a question that is
 * one tap away from the first.
 *
 * What it does *not* do is decide anything. Both lists come from
 * `app/api/kamers/<room>/…`, which asks the same questions `placeItem` and
 * `buyFurnishing` ask and shows what survives them; a refusal, if the archive
 * moved under the sheet, still comes from the server and is shown as it is
 * written there.
 *
 * With an empty box the owned list is already there — the most recently
 * touched voorwerpen that fit this plek. A picker that shows nothing until you
 * type is a picker that cannot answer "what have I got?", which is the
 * question somebody standing in front of an empty plank actually has. The
 * catalogue has no box at all: it is already narrow (one kind of plek, one
 * campaign's huisraad) and it arrives sorted by price, which is the order
 * somebody saving up reads it in.
 *
 * **Too dear is still listed** — greyed, with the price on it and a held
 * button that says how much is missing. That is `UnlockButton`'s rule again in
 * a new place: a kamer that shows only what you can already afford gives you
 * nothing to save up for.
 */
export function PlaceButton({
  roomId,
  slotId,
  kind,
  kindLabel,
  balance,
  words,
}: {
  roomId: string;
  slotId: string;
  kind: PlekKind;
  /** The plek's kind in the Keeper's own word, for the sheet's heading. */
  kindLabel: string;
  /** What is in the grootboek right now — what decides whether a row is out of reach. */
  balance: number;
  words: Words;
}) {
  const ui = useUi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('bezit');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Voorwerp[]>([]);
  /** Heeft de vraag "wat heb ik dat hier past" al een *antwoord* gegeven? Een
      lege lijst vóór het antwoord is geen lege lijst (zie het effect hieronder). */
  const [answered, setAnswered] = useState(false);
  const [shop, setShop] = useState<CatalogueEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => boxRef.current?.focus(), 60);
  }, [open]);

  /*
   * §85: open op het tabblad dat iets te zeggen heeft.
   *
   * De kiezer begon altijd bij *Wat je al hebt*, en voor iedereen die nog
   * niets bezit is dat een leeg blad met één zin erin — op de eerste avond
   * dus voor iedereen. De vraag "wat heb ik dat hier past" is de goede eerste
   * vraag zodra het antwoord bestaat, en daarvóór is hij een doodlopende weg.
   *
   * Het gebeurt nadat het antwoord binnen is en nooit ervoor: er is geen
   * tweede telling op de server die zou kunnen verschillen van de lijst die
   * hier staat. En het gebeurt precies één keer per opening (`switched`), want
   * een tabblad dat onder je hand terugspringt zodra je typt is erger dan een
   * leeg tabblad.
   */
  const [switched, setSwitched] = useState(false);
  useEffect(() => {
    if (!open) {
      setSwitched(false);
      return;
    }
    /*
     * `answered` is de hele zaak. `items` begint leeg — dat is "nog niet
     * gevraagd", niet "niets gevonden" — dus zonder deze vraag sprong het blad
     * élke keer naar de catalogus, ook voor iemand met een plank vol, in de
     * tel tussen het openen en het antwoord. Precies de fout die §80 in deze
     * zelfde component al eens opschreef over `shop === null`, een tabblad
     * verderop.
     */
    if (switched || !answered || tab !== 'bezit' || query.trim() || items.length > 0) return;
    setSwitched(true);
    setTab('catalogus');
  }, [open, switched, answered, tab, query, items.length]);

  useEffect(() => {
    if (!open || tab !== 'bezit') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/kamers/${roomId}/voorwerpen?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { entries?: Voorwerp[] };
        setItems(data.entries ?? []);
        setAnswered(true);
      } catch {
        /* ignore — an aborted ask is the next keystroke's, not a failure */
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, tab, query, roomId, kind]);

  /*
   * The catalogue is asked for once per opening of the tab, not on a timer:
   * there is nothing to type into it, and what is for sale does not change
   * between two glances. `null` is "not asked yet" and is what the tab shows a
   * quiet line for; an empty array is a real answer and gets `catalogueEmpty`.
   */
  useEffect(() => {
    if (!open || tab !== 'catalogus') return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(
          `/api/kamers/${roomId}/catalogus?kind=${encodeURIComponent(kind)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { entries?: CatalogueEntry[] };
        setShop(data.entries ?? []);
      } catch {
        /* ignore — an aborted ask is a closed sheet's, not a failure */
      }
    })();
    return () => controller.abort();
  }, [open, tab, roomId, kind]);

  function done() {
    setOpen(false);
    setQuery('');
    setShop(null);
    setAnswered(false);
    router.refresh();
  }

  async function place(entry: Voorwerp) {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/place`, { entryId: entry.id });
      if (error) {
        ui.toast(error);
        return;
      }
      // §84: zeggen wat er gebeurd is. Geen *Bekijk*-knop hier: je staat al in
      // de kamer en het blad sluit op de tegel die net gevuld is.
      ui.toast(fill(words.boughtHere, { ding: entry.name, plek: plekWord(kind, words) }));
      done();
    } finally {
      setBusy(false);
    }
  }

  /**
   * §80: buying. The price, the balance, the double click and every other
   * refusal are `buyFurnishing`'s — this only asks, and shows the sentence
   * that comes back.
   */
  async function buy(entry: CatalogueEntry) {
    setBusy(true);
    try {
      const error = await kamerPost(`/api/kamers/${roomId}/plekken/${slotId}/buy`, { entryId: entry.id });
      if (error) {
        ui.toast(error);
        return;
      }
      ui.toast(
        `${fill(words.boughtHere, { ding: entry.name, plek: plekWord(kind, words) })} −${munt(entry.price, words)}`,
      );
      done();
    } finally {
      setBusy(false);
    }
  }

  const titleId = `plek-place-${slotId}`;

  return (
    <>
      <button
        type="button"
        className="btn btn-small plek-action"
        data-testid="plek-place"
        onClick={() => {
          setTab('bezit');
          setAnswered(false);
          setOpen(true);
        }}
      >
        <Icon name="plus" size={13} />
        {words.slotPlace}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy={titleId}>
          <div data-testid="plek-picker" data-tab={tab}>
            <h2 id={titleId} style={{ margin: '0 0 0.2rem', fontSize: '1.2rem' }}>
              {words.slotPlace} &mdash; {kindLabel}
            </h2>
            {/*
              §84: dezelfde beurs als overal. Dit was de derde tekening van één
              getal — een `.stamp` in de kamer, een `.stamp` in de winkel en
              hier een grijze `.tiny` — en dat maakte het saldo drie keer iets
              anders in één feature.
            */}
            <p style={{ margin: '0 0 0.6rem' }} data-testid="plek-picker-saldo">
              <Beurs balance={balance} words={words} size="small" />
            </p>

            {/*
              §11: the second tab is named by the Keeper's own word
              (`catalogue`), so a campaign that calls its catalogue something
              else gets that word here. The first is a plain Dutch phrase and
              not a renameable noun — the same class of string as "Zoeken…"
              and "Niets dat hier past." below — because it names a *question*
              ("what have I already got?") rather than a thing in the archive.

              **§85 made them tabs.** They were `chip-selectable` with
              `aria-pressed`, which is the archive's pattern for a *filter* —
              and a filter is something you may have none or several of. These
              two are neither: exactly one is always on, and pressing one turns
              the other off. A screen reader was told "two toggle buttons" for
              what is one list with two faces, and on a phone the chips were
              30 px tall, under §69 6.1's floor. So: a real `tablist`, an
              underline for the one you are on, and `--tap` under both.
            */}
            <div className="kamer-tabs" role="tablist" aria-label={words.slotPlace}>
              <button
                type="button"
                role="tab"
                id={`${titleId}-tab-bezit`}
                className={`kamer-tab${tab === 'bezit' ? ' kamer-tab-aan' : ''}`}
                aria-selected={tab === 'bezit'}
                aria-controls={`${titleId}-paneel`}
                data-testid="plek-picker-tab-bezit"
                onClick={() => setTab('bezit')}
              >
                <Icon name={MEANING.kamer} size={13} />
                Wat je al hebt
              </button>
              <button
                type="button"
                role="tab"
                id={`${titleId}-tab-catalogus`}
                className={`kamer-tab${tab === 'catalogus' ? ' kamer-tab-aan' : ''}`}
                aria-selected={tab === 'catalogus'}
                aria-controls={`${titleId}-paneel`}
                data-testid="plek-picker-tab-catalogus"
                onClick={() => setTab('catalogus')}
              >
                <Icon name={MEANING.catalogus} size={13} />
                {capitalise(words.catalogue)}
              </button>
            </div>

            {/*
              §85: één zoekvak, boven allebei de tabs.
              
              Het stond in het eerste tabblad, dus wie op de catalogus zocht
              moest eerst terug — en het vak sprong bij elke wissel weg en
              weer terug, wat de hele kiezer liet springen. Het filtert nu
              allebei de lijsten: het bezit op de server (dat zijn duizend
              artikelen), de catalogus in de browser (die is al binnen en
              telt er tien).
            */}
            <label className="visually-hidden" htmlFor={`${titleId}-zoek`}>
              Zoeken
            </label>
            <input
              id={`${titleId}-zoek`}
              ref={boxRef}
              className="input kamer-zoek"
              data-testid="plek-picker-zoek"
              value={query}
              placeholder="Zoeken…"
              onChange={(event) => setQuery(event.target.value)}
            />

            <div
              id={`${titleId}-paneel`}
              role="tabpanel"
              aria-labelledby={`${titleId}-tab-${tab}`}
            >
            {tab === 'bezit' ? (
              <>
                {items.length === 0 ? (
                  <p className="small muted" style={{ marginTop: '0.7rem' }} data-testid="plek-picker-leeg">
                    Niets dat hier past.
                  </p>
                ) : (
                  <ul className="suggest-list" style={{ marginTop: '0.6rem' }}>
                    {items.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className="suggest-item"
                          data-testid="plek-picker-optie"
                          data-entry-id={entry.id}
                          disabled={busy}
                          onClick={() => void place(entry)}
                        >
                          <Icon name={entry.typeIcon} size={16} style={{ color: entry.typeColour }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <strong>{entry.name}</strong>
                            <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                              {entry.shortDescription || entry.typeLabel}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <Catalogus
                entries={shop}
                query={query}
                balance={balance}
                busy={busy}
                words={words}
                onBuy={(entry) => void buy(entry)}
              />
            )}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

/**
 * §80: de catalogus, één tabblad.
 *
 * Every row carries the same four things, in the order somebody saving up
 * reads them: the cover, the name with its one line, **the price**, and what
 * the thing says it gives. The effect lines are on the row rather than a step
 * away on the artikel, because "what does it do" is the question being asked
 * at the moment of buying, and an archive that makes you leave the sheet to
 * answer it is an archive you stop using.
 *
 * They are shown and never counted, added or compared (rule 78). The archive
 * lists; the table decides.
 */
function Catalogus({
  entries,
  query,
  balance,
  busy,
  words,
  onBuy,
}: {
  /** `null` until the ask comes back — "nothing yet" is not the same answer as "nothing". */
  entries: CatalogueEntry[] | null;
  /** §85: what is in the one search box above both tabs. Filtered here rather
      than asked again: this list is already in the browser and it is short. */
  query: string;
  balance: number;
  busy: boolean;
  words: Words;
  onBuy: (entry: CatalogueEntry) => void;
}) {
  if (entries === null) {
    return (
      <p className="small muted" style={{ marginTop: '0.7rem' }} data-testid="plek-catalogus-bezig">
        Even kijken…
      </p>
    );
  }
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter((entry) => entry.name.toLowerCase().includes(needle))
    : entries;

  if (!shown.length) {
    return (
      <p className="small muted" style={{ marginTop: '0.7rem' }} data-testid="plek-catalogus-leeg">
        {words.catalogueEmpty}
      </p>
    );
  }

  return (
    <ul className="kamer-catalogus" data-testid="plek-catalogus" aria-label={capitalise(words.catalogue)}>
      {shown.map((entry) => {
        const short = entry.price - balance;
        const affordable = short <= 0;
        return (
          <li
            key={entry.id}
            className={`kamer-koop${affordable ? '' : ' kamer-koop-dear'}`}
            data-testid="plek-catalogus-rij"
            data-entry-id={entry.id}
            data-price={entry.price}
            /* The one attribute an e2e spec needs to tell the two states apart
               — the greying itself is `--ink-muted` and a colour is never a
               fact a test may read (§45). */
            data-afford={affordable ? 'ja' : 'nee'}
          >
            {/* §85: `box` is de **kist** en niets anders (§84's tabel). Een
                stuk huisraad zonder omslag droeg hier het kistje, en een rij
                over een schilderij kreeg dus het icoon van een lade. De
                catalogus leent haar eigen vorm uit. */}
            <Thumb assetId={entry.coverAssetId} icon={MEANING.catalogus} />
            <div className="kamer-koop-body">
              <p className="kamer-koop-name">
                <strong>{entry.name}</strong>
              </p>
              {entry.shortDescription && (
                <p className="tiny muted clamp-2 kamer-koop-line">{entry.shortDescription}</p>
              )}
              {entry.effect.length > 0 && (
                <ul className="tiny kamer-koop-effect" aria-label={words.roomEffects}>
                  {entry.effect.map((line, index) => (
                    <li key={index} data-testid="plek-catalogus-effect">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="kamer-koop-buy">
              <span className="stamp kamer-koop-price" data-testid="plek-catalogus-prijs">
                {munt(entry.price, words)}
              </span>
              {/*
                §84: de derde en laatste kopie van deze zin. Hij stond hier, op
                de tegel en in de winkelrij, alle drie letterlijk in de code en
                alle drie in een `title` — die op een telefoon niet bestaat.
                Eén `shortfall()`, zichtbaar, en de knop is weg in plaats van
                dood.
              */}
              {affordable ? (
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  data-testid="plek-koop"
                  disabled={busy}
                  onClick={() => onBuy(entry)}
                >
                  <Icon name={MEANING.munt} size={13} />
                  {withPrice(words.buy, entry.price, words)}
                </button>
              ) : (
                <span className="tiny winkel-short" data-testid="plek-catalogus-short">
                  {shortfall(entry.price, balance, words)}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
