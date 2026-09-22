'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useMayStartEntry } from '@/components/you/AuthorProvider';
import { ShortField } from '@/components/live/LiveFields';
import { SideChoice } from '@/components/keeper/SideChoice';
import { Sheet } from './Sheet';
import { useUi } from './UiProvider';
import { capitalise, fill } from '@/lib/words';
import { clearDraft, readDraft, writeDraft, DRAFT_ENTRY } from '@/lib/sheetDraft';
import type { EntryTypeLite } from './UiProvider';

export type CreatedEntry = {
  id: string;
  slug: string;
  name: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  shortDescription: string;
  /** §48: whether the sheet has already put it in the dossier it was made in. */
  filed?: boolean;
};

export type NewEntryPrefill = {
  name?: string;
  shortDescription?: string;
  typeSlug?: string;
  /**
   * §24: the dossier this is being made in, when it is. Set by the dossier's
   * own add-box, by the `+`, the FAB and `n` on a dossier's page, and by the
   * `@` in a dossier's own writing.
   *
   * §49: and it is not a question any more. Whatever road it came in by, an
   * artikel made inside a dossier is filed in that dossier — the only thing the
   * sheet still asks is whether the dossier's name goes in front of its own.
   */
  caseId?: string;
  /** When set, the sheet hands the entry back instead of navigating to it. */
  onCreated?: (entry: CreatedEntry) => void;
};

/** §6, verbatim. */
const DESCRIPTION_PLACEHOLDER =
  'Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste ontmoeting, en hoe zagen ze eruit?';

const LAST_TYPE_KEY = 'zcf:last-type';

/*
 * §93 (E24): de infobox-velden van huisraad, pas geladen als het blad ze
 * vraagt — dit blad hangt in de schil van elke pagina, en de veldcomponenten
 * zijn voor bijna iedereen nooit nodig.
 */
const FieldsEditor = dynamic(() => import('@/components/entry/FieldsEditor').then((mod) => mod.FieldsEditor), {
  ssr: false,
});

/** §93: staat dit ding na het maken in de winkel? Dezelfde twee vragen als `shopFor`: een plek en een prijs. */
function forSale(values: Record<string, unknown>): boolean {
  const plek = values.plek;
  const price = Number(values.prijs);
  return (Array.isArray(plek) ? plek.length > 0 : Boolean(plek)) && Number.isFinite(price) && price > 0;
}

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
  shortDescription: string;
};

export function NewEntrySheet({
  types: allTypes,
  prefill,
  onClose,
  onCreated,
}: {
  types: EntryTypeLite[];
  prefill: NewEntryPrefill;
  onClose: () => void;
  onCreated: (entry: CreatedEntry) => void;
}) {
  /**
   * §49: every soort, everywhere. §24 kept Clues and Voorwerpen out of this
   * list unless the sheet was opened in a dossier — a courtesy in front of a
   * refusal on the server — and both are gone. A clue made in the wiki is an
   * ordinary artikel with nothing in front of its name; if it was meant to
   * belong to an investigation, the wiki says so with the "zonder dossier" chip
   * until somebody files it.
   */
  const inCase = Boolean(prefill.caseId);
  /*
   * §80: except the soorten the Keeper keeps to himself.
   *
   * `createEntry` refuses these for anybody else, and that is the lock. This is
   * the slot on the outside of the door: without it a speler is offered
   * *Huisraad*, types a name, presses Aanmaken and is told off for taking what
   * they were shown. The browser run found exactly that — the comment in
   * `lib/entries/service.ts` claimed this filter existed before it did.
   */
  const { isKeeper } = useUi();
  const types = useMemo(
    () => (isKeeper ? allTypes : allTypes.filter((type) => !type.keeperMade)),
    [allTypes, isKeeper],
  );

  const initialType = useMemo(() => {
    if (prefill.typeSlug && types.some((t) => t.slug === prefill.typeSlug)) return prefill.typeSlug;
    if (typeof window !== 'undefined') {
      const remembered = window.localStorage.getItem(LAST_TYPE_KEY);
      if (remembered && types.some((t) => t.slug === remembered)) return remembered;
    }
    return types[0]?.slug ?? 'character';
  }, [prefill.typeSlug, types]);

  const ui = useUi();
  const words = ui.words;
  /*
   * §48: the dossier this screen is, when the sheet was opened from one. Its
   * name (so the tickbox can say where the thing is going) and its side (so a
   * voorwerp made in the Keeper's dossier cannot be born on the players' side).
   */
  const here = ui.caseHere && ui.caseHere.id === prefill.caseId ? ui.caseHere : null;
  /*
   * §69 (4.5): what was typed here survives an Escape. A prefill wins over a
   * draft and throws it away — see `lib/sheetDraft.ts` for why that is the
   * honest order.
   */
  const seeded = Boolean(prefill.name || prefill.shortDescription);
  const draft = useMemo(() => {
    if (seeded) {
      clearDraft(DRAFT_ENTRY);
      return {};
    }
    return readDraft(DRAFT_ENTRY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [typeSlug, setTypeSlug] = useState(initialType);
  /** §92 (C26): the soort strip folded out to every chip. */
  const [typesOpen, setTypesOpen] = useState(false);
  const typeStripRef = useRef<HTMLDivElement | null>(null);
  // The chosen soort in view in the strip, once, when the sheet opens.
  useEffect(() => {
    const chosenChip = typeStripRef.current?.querySelector<HTMLElement>('[data-chosen="true"]');
    const strip = typeStripRef.current;
    if (chosenChip && strip) strip.scrollLeft = Math.max(0, chosenChip.offsetLeft - strip.offsetLeft - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** §92 (C27): the open dossiers, for the optional "In dossier" line. */
  const [openCases, setOpenCases] = useState<{ id: string; name: string }[]>([]);
  const [chosenCase, setChosenCase] = useState('');
  useEffect(() => {
    if (prefill.caseId) return;
    let alive = true;
    void fetch('/api/cases')
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((data: { cases?: { id: string; name: string; status: string }[] }) => {
        if (alive) setOpenCases((data.cases ?? []).filter((item) => item.status === 'open'));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [prefill.caseId]);
  const [name, setName] = useState(prefill.name ?? draft.name ?? '');
  const [description, setDescription] = useState(prefill.shortDescription ?? draft.description ?? '');
  const [similar, setSimilar] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** §93 (E24): plek, prijs en effect van nieuw huisraad — leeg tot de Keeper iets kiest. */
  const [shopValues, setShopValues] = useState<Record<string, unknown>>({});
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  /*
   * §49: the dossier is not a question any more — made in it is filed in it,
   * and `caseId` always goes with the request. What the tickbox asks instead is
   * whether the dossier's name is printed in front of this artikel's, which is
   * the only thing §24 ever really did with it.
   *
   * `null` means "nobody has touched it", so the answer follows the soort's own
   * habit and keeps following it while the person tries another chip — a Clue
   * arrives ticked, a persoon does not. One click anywhere in the box makes it
   * theirs and the chips stop moving it.
   *
   * §48, unchanged: the side. Everything made here is born where the hand is
   * standing, and a Keeper may say otherwise — except inside a dossier that is
   * the Keeper's own, where the answer is not theirs to give.
   */
  const chosen = types.find((type) => type.slug === typeSlug);
  const [prefixChoice, setPrefixChoice] = useState<boolean | null>(null);
  const prefix = prefixChoice ?? Boolean(chosen?.prefixDefault);
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  /*
   * §90: the caret in the name box, from the moment the box exists. This was
   * an effect on mount, and `Sheet` draws nothing on its first commit (a portal
   * cannot be made during a server render) — so the effect found no box, the
   * sheet then focused its own panel, and after "met wie ben je nu aan het
   * schrijven?" the person had to click into the name before typing it. A
   * callback ref runs when the box is actually attached, once.
   */
  const nameFocused = useRef(false);
  const attachName = (element: HTMLInputElement | null) => {
    nameRef.current = element;
    if (!element || nameFocused.current) return;
    nameFocused.current = true;
    element.focus();
    element.select();
  };

  /*
   * §69 (4.5): every keystroke, into the page-lived draft. On unmount rather
   * than on close, because there are three ways out of this sheet (Escape, the
   * backdrop, the cross) and only one of them is a handler this component
   * owns.
   */
  useEffect(() => {
    writeDraft(DRAFT_ENTRY, { name, description });
  }, [name, description]);

  /*
   * §18b: opening this sheet *is* an act of writing — there is nothing else it
   * could be — so the window has to have said who it is writing as. It has:
   * the question is asked *before* this sheet opens, by `ensureAuthor` inside
   * `useUi().openNewEntry`, which is the only door in. It used to be asked
   * from here, on mount, and that put the question on top of this sheet — two
   * sheets at once, and an Escape that closed the wrong one.
   *
   * There is nothing to ask a speler with no onderzoeker, who is the one
   * person this sheet must still work for: the artikel they are about to make
   * is the onderzoeker they have not got. Hence `mayStartEntry` and not
   * `mayType` on the button below.
   */
  const mayStartEntry = useMayStartEntry();

  // "Did you mean…" — up to 5 existing entries with similar names.
  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setSimilar([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}&limit=5`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { entries: Suggestion[] };
        setSimilar(data.entries ?? []);
      } catch {
        /* aborted or offline — the sheet still works */
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          typeSlug,
          name: name.trim(),
          shortDescription: description,
          // §49: made here is filed here. Always, by every road in.
          // §92 (C27): or in the dossier chosen on the line above.
          caseId: prefill.caseId ?? (chosenCase || undefined),
          // §49: and whether that dossier's name is printed in front of this
          // one's. Only asked where there is a dossier to print — outside one
          // the soort's own habit decides, on the server.
          casePrefix: inCase ? prefix : undefined,
          // §48: which side it is born on. Ignored by the server for anyone
          // who is not a Keeper, and overruled by a Keeper-only dossier.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
          // §93 (E24): de winkelvelden, alleen voor een soort die ze heeft.
          fields: chosen?.shopFields ? shopValues : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan is niet gelukt.');
        setBusy(false);
        return;
      }
      window.localStorage.setItem(LAST_TYPE_KEY, typeSlug);
      /*
       * §93 (E24): zeggen waar het huisraad nu staat, met de deur erheen — of
       * dat het nog niet te koop is, want een stuk zonder plek of prijs staat
       * nergens en dat zag niemand.
       */
      if (chosen?.shopFields) {
        const made = (data.entry as CreatedEntry | undefined)?.name ?? name.trim();
        if (forSale(shopValues)) {
          ui.toast(
            fill(words.newFurnishingDone, { naam: made, winkel: words.shop.toLowerCase() }),
            {
              label: fill(words.toastShop, { winkel: words.shop.toLowerCase() }),
              onAction: () => router.push('/winkel'),
            },
          );
        } else {
          ui.toast(fill(words.furnishingNotForSale, { naam: made }));
        }
      }
      // §69 (4.5): it exists now, so the draft of it is done. Without this the
      // next `+` opens pre-filled with the artikel that was just made.
      clearDraft(DRAFT_ENTRY);
      onCreated({ ...(data.entry as CreatedEntry), filed: Boolean(data.filed) });
    } catch {
      setError('Geen verbinding met het archief.');
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} labelledBy="new-entry-title">
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <h2 id="new-entry-title" style={{ margin: 0, fontSize: '1.3rem' }}>
          {words.newEntry}
        </h2>
      </div>

      <div className="field">
        <label className="label" htmlFor="new-entry-name">
          Naam
        </label>
        <input
          id="new-entry-name"
          ref={attachName}
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void create();
            }
          }}
          autoComplete="off"
          enterKeyHint="done"
        />

        {/* §92 (C28): one line per name, and at most three — it is a warning
            against a double, not a search, and at two lines a row it pushed
            the rest of the sheet down while the name was being typed. */}
        {similar.length > 0 && (
          <div className="new-entry-similar">
            <p className="tiny muted" style={{ margin: '0.4rem 0 0.2rem' }}>
              {words.newEntryDidYouMean}
            </p>
            <ul className="suggest-list new-entry-similar-list">
              {similar.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/e/${entry.slug}`}
                    className="suggest-item"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    <Icon name={entry.typeIcon} size={15} style={{ color: entry.typeColour }} />
                    <span className="new-entry-similar-name">
                      <strong>{entry.name}</strong>
                      <span className="tiny muted"> · {entry.typeLabel}</span>
                    </span>
                    <Icon name="chevron" size={15} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/*
        §92 (C26): the soort is one line, under the name. Seventeen chips
        wrapped over eight rows put the name box 1.7 screens down on a phone,
        while the soort remembered from last time was already chosen. The chips
        are still radios in one group (and every spec and screen reader finds
        them by name) — they stand in a strip that scrolls sideways, with the
        chosen one scrolled into view, and "Alle soorten" folds the strip out.
      */}
      <div className="field new-entry-types">
        <div className="row" style={{ gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.3rem' }}>
          <span className="label" id="new-entry-type-label" style={{ margin: 0 }}>
            {capitalise(words.entryType)}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-small new-entry-types-more"
            aria-expanded={typesOpen}
            onClick={() => setTypesOpen((current) => !current)}
          >
            {words.newEntryTypeMore}
            <Icon name="chevron" size={12} className={typesOpen ? 'new-entry-types-caret-open' : undefined} />
          </button>
        </div>
        <div
          ref={typeStripRef}
          className={`new-entry-types-strip${typesOpen ? ' new-entry-types-open' : ''}`}
          role="radiogroup"
          aria-labelledby="new-entry-type-label"
        >
          {types.map((type) => (
            <button
              key={type.slug}
              type="button"
              role="radio"
              aria-checked={type.slug === typeSlug}
              data-chosen={type.slug === typeSlug ? 'true' : undefined}
              className={`chip chip-selectable${type.slug === typeSlug ? ' chip-active' : ''}`}
              onClick={() => setTypeSlug(type.slug)}
            >
              <Icon name={type.icon} size={15} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        §92 (C27): a dossier to put it in, from here — optional, and only where
        the sheet was not already opened inside one (then it goes there, §49).
        The open dossiers this hand may see, from the same list "Aan dossier
        toevoegen" shows; the server asks the dossier's own dials again (§17).
      */}
      {!inCase && openCases.length > 0 && (
        <div className="field row new-entry-case" style={{ gap: '0.5rem', alignItems: 'center' }}>
          <label className="label" htmlFor="new-entry-case" style={{ margin: 0, flex: '0 0 auto' }}>
            {fill(words.newEntryInCase, { dossier: words.case })}
          </label>
          <select
            id="new-entry-case"
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            value={chosenCase}
            onChange={(event) => setChosenCase(event.target.value)}
          >
            <option value="">{words.newEntryNoCase}</option>
            {openCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="label" id="new-entry-description-label" htmlFor="new-entry-description">
          Korte beschrijving
        </label>
        {/* §95: the same box as on the artikel's own page — a name picked
            from the list is a chip with its artikel in it, and the artikel
            this sheet makes is born with it. No room yet: it does not exist. */}
        <ShortField
          noRoom
          ungated
          field="shortDescription"
          id="new-entry-description"
          className="textarea short-editor-sheet"
          ariaLabelledBy="new-entry-description-label"
          value={description}
          placeholder={DESCRIPTION_PLACEHOLDER}
          onValue={(next) => setDescription(next)}
        />
      </div>

      {/*
        §93 (E24): een stuk huisraad maken was negen handelingen, en de drie
        velden die het tot huisraad maken kwamen pas ná het aanmaken — op een
        telefoon onder de landkaart- en tijdlijnchips. Nu vraagt het blad ze
        meteen, met dezelfde veldcomponenten als de infobox. Een eigen blok
        onder de gewone velden, zodat de bovenkant van dit blad van ronde 53
        blijft.
      */}
      {chosen?.shopFields && (
        <section className="field new-entry-winkel" data-testid="new-entry-winkel" aria-labelledby="new-entry-winkel-title">
          <h3 id="new-entry-winkel-title" className="label" style={{ margin: '0 0 0.4rem' }}>
            {words.newFurnishing}
          </h3>
          <FieldsEditor
            fields={chosen.shopFields}
            values={shopValues}
            onChange={(patch) => setShopValues((current) => ({ ...current, ...patch }))}
          />
        </section>
      )}

      {/* §49: the one question left about the dossier. Not *whether* it goes in
          there — that is settled by being here — but whether every list in the
          archive prints the dossier in front of its name. */}
      {inCase && (
        <label className="field row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={prefix}
            onChange={(event) => setPrefixChoice(event.target.checked)}
          />
          <span>
            {here?.name
              ? `Zet "${here.name}:" voor de naam`
              : `Zet dit ${words.case} voor de naam`}
            <span className="tiny muted" style={{ display: 'block' }}>
              {`Alleen hoe het in lijsten heet. Het komt hoe dan ook in ${here?.name ?? `dit ${words.case}`} te liggen.`}
            </span>
          </span>
        </label>
      )}

      <SideChoice
        show={ui.isKeeper}
        keeper={sideLocked || keeperSide}
        locked={sideLocked}
        lockedWhy={`${here?.name ?? `Dit ${words.case}`} is van de ${words.keeper}.`}
        onChange={setKeeperSide}
        words={words}
      />

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={create}
        disabled={!mayStartEntry || !name.trim() || busy}
      >
        {busy ? 'Opbergen…' : 'Aanmaken'}
      </button>
      {/* §90: the Keeper has `SideChoice` above to say who reads this; a speler
          was told nothing. One grey line, and where to change it afterwards. */}
      {!ui.isKeeper && (
        <p className="tiny muted" style={{ margin: '0.5rem 0 0' }}>
          {fill(words.newEntryWhoReads, { beheer: words.manage })}
        </p>
      )}
    </Sheet>
  );
}
