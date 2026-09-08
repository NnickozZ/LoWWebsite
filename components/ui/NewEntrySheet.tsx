'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { useMayStartEntry } from '@/components/you/AuthorProvider';
import { MentionPopover } from './MentionPopover';
import { SideChoice } from '@/components/keeper/SideChoice';
import { Sheet } from './Sheet';
import { useUi } from './UiProvider';
import { capitalise } from '@/lib/words';
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
   * own add-box (and by a prikbord that hangs off one). Without it the sheet
   * does not offer the soorten that only exist inside a dossier, and the server
   * refuses one anyway.
   */
  caseId?: string;
  /**
   * §48: the dossier is where this is being made, but filing it there is a
   * question rather than a fact. Set by the `@` in a dossier's own writing —
   * naming somebody in the werktheorie is not always putting them on a shelf.
   * The dossier's own add-box and the `+` in the menu leave it off: those are
   * the roads that mean "put this in here", and the tickbox is simply already
   * ticked.
   */
  askToFile?: boolean;
  /** When set, the sheet hands the entry back instead of navigating to it. */
  onCreated?: (entry: CreatedEntry) => void;
};

/** §6, verbatim. */
const DESCRIPTION_PLACEHOLDER =
  'Waar kwam je ze tegen, wat was de sfeer, wat was de context van de eerste ontmoeting, en hoe zagen ze eruit?';

const LAST_TYPE_KEY = 'zcf:last-type';

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
   * §24: which soorten this sheet may offer. Opened from a dossier, all of
   * them; opened from anywhere else, only the ones that live in the wiki on
   * their own. A voorwerp with no investigation behind it is a row nobody can
   * explain, so it is not offered rather than offered and then refused.
   */
  const inCase = Boolean(prefill.caseId);
  const types = useMemo(
    () => (inCase ? allTypes : allTypes.filter((type) => !type.caseOnly)),
    [allTypes, inCase],
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
  const [typeSlug, setTypeSlug] = useState(initialType);
  const [name, setName] = useState(prefill.name ?? '');
  const [description, setDescription] = useState(prefill.shortDescription ?? '');
  const [similar, setSimilar] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  /*
   * §48: two questions this sheet never asked before.
   *
   * The first is the dossier: made *in* it and *filed* in it are one fact
   * (§24's `originCaseId` follows the shelves), so the tickbox decides whether
   * `caseId` is sent at all. A soort that exists only inside a dossier has no
   * choice — there is no such thing as an unfiled voorwerp — so for those it is
   * ticked and switched off, with the reason written under it.
   *
   * The second is the side. Everything made here is born where the hand is
   * standing (§48), and a Keeper may say otherwise — except inside a dossier
   * that is the Keeper's own, where the answer is not theirs to give: a wall,
   * a wire or a clue in a Keeper's dossier that the table can read is the leak
   * this round was opened to close.
   */
  const [file, setFile] = useState(!prefill.askToFile);
  const chosen = types.find((type) => type.slug === typeSlug);
  const mustFile = Boolean(chosen?.caseOnly);
  const filing = inCase && (mustFile || file);
  const sideLocked = Boolean(here?.keeperOnly);
  const [keeperSide, setKeeperSide] = useState(sideLocked || ui.side === 'keeper');

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

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
          // §48: only when it is actually being filed there. The two are one
          // fact, and an artikel wearing a dossier's name it is not in would
          // be the wrong kind of half-truth.
          caseId: filing ? prefill.caseId : undefined,
          // §48: which side it is born on. Ignored by the server for anyone
          // who is not a Keeper, and overruled by a Keeper-only dossier.
          keeperOnly: ui.isKeeper ? sideLocked || keeperSide : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Opslaan is niet gelukt.');
        setBusy(false);
        return;
      }
      window.localStorage.setItem(LAST_TYPE_KEY, typeSlug);
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
        <div className="spacer" />
        <button className="btn btn-ghost btn-small" type="button" onClick={onClose} aria-label="Sluiten">
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        className="row-wrap"
        role="radiogroup"
        aria-label={capitalise(words.entryType)}
        style={{ marginBottom: '0.9rem' }}
      >
        {types.map((type) => (
          <button
            key={type.slug}
            type="button"
            role="radio"
            aria-checked={type.slug === typeSlug}
            className={`chip chip-selectable${type.slug === typeSlug ? ' chip-active' : ''}`}
            onClick={() => setTypeSlug(type.slug)}
          >
            <Icon name={type.icon} size={15} />
            {type.label}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="label" htmlFor="new-entry-name">
          Naam
        </label>
        <input
          id="new-entry-name"
          ref={nameRef}
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

        {similar.length > 0 && (
          <>
            <p className="tiny muted" style={{ margin: '0.5rem 0 0' }}>
              Bedoel je…
            </p>
            <ul className="suggest-list">
              {similar.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/e/${entry.slug}`}
                    className="suggest-item"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={onClose}
                  >
                    <Icon name={entry.typeIcon} size={16} style={{ color: entry.typeColour }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{entry.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {entry.typeLabel}
                      </span>
                    </span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="new-entry-description">
          Korte beschrijving
        </label>
        <textarea
          id="new-entry-description"
          ref={descriptionRef}
          className="textarea"
          value={description}
          placeholder={DESCRIPTION_PLACEHOLDER}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
        />
        {/* §48: `@` here too. Every plain box in the archive offers names now,
            and the first description somebody writes is exactly where they
            reach for one. */}
        <MentionPopover forRef={descriptionRef} />
      </div>

      {inCase && (
        <label className="field row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={filing}
            disabled={mustFile}
            onChange={(event) => setFile(event.target.checked)}
          />
          <span>
            {`Opbergen in ${here?.name ?? `dit ${words.case}`}`}
            {mustFile && (
              <span className="tiny muted" style={{ display: 'block' }}>
                {`${chosen?.label ?? 'Dit'} bestaat alleen binnen een ${words.case}.`}
              </span>
            )}
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
    </Sheet>
  );
}
