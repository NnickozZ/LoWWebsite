'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { BoardCard } from '@/lib/boards/merge';

/** Anything the wall can be told to point at: an id and a name, no more. */
export type PickableItem = { id: string; name: string };

/** What `/api/suggest` hands back for an artikel. */
export type SuggestedEntry = {
  id: string;
  name: string;
  typeIcon: string;
  typeColour: string;
  typeLabel: string;
};

/**
 * §52: the wall's own picker, in one place.
 *
 * It used to be three things inside `BoardCanvas` — the `/api/suggest` effect,
 * the list of landkaarten/dossiers/tijdlijnen that match what is typed, and a
 * hundred lines of `<li>` — and all three were nailed to the bar at the top of
 * the page. The string that is let go on bare cork wants exactly the same
 * picker at exactly the spot it was dropped, so it is a component now and the
 * two places differ only in where they sit and what they do with the answer.
 *
 * It searches *and* makes: the last two rows write a notitie or a whole new
 * artikel under whatever was typed, which is what makes a string dropped in
 * the void useful rather than a question you have to answer somewhere else
 * first.
 */
export function BoardPicker({
  variant,
  cards,
  pickableMaps,
  pickableCases,
  pickableTimelines,
  pickableBoards,
  onPickEntry,
  onPickMap,
  onPickCase,
  onPickTimeline,
  onPickBoard,
  onCreateNote,
  onCreateEntry,
  onCancel,
  style,
}: {
  /**
   * `bar` is the search box in the board's toolbar, which is always there and
   * shows its list underneath. `float` is the one that opens where a string
   * was dropped: it takes focus, closes on Escape, and is anchored by `style`.
   */
  variant: 'bar' | 'float';
  /** What is already on the wall, so the same thing is not offered twice. */
  cards: BoardCard[];
  pickableMaps: PickableItem[];
  pickableCases: PickableItem[];
  pickableTimelines: PickableItem[];
  pickableBoards: PickableItem[];
  onPickEntry: (entry: SuggestedEntry) => void;
  onPickMap: (item: PickableItem) => void;
  onPickCase: (item: PickableItem) => void;
  onPickTimeline: (item: PickableItem) => void;
  onPickBoard: (item: PickableItem) => void;
  onCreateNote: (name: string) => void;
  onCreateEntry: (name: string) => void;
  /** Escape, or a click on nothing. Only the floating one has one. */
  onCancel?: () => void;
  style?: React.CSSProperties;
}) {
  const ui = useUi();
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (variant === 'float') inputRef.current?.focus();
  }, [variant]);

  useEffect(() => {
    const typed = search.trim();
    if (typed.length < 1) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=6`, {
          signal: controller.signal,
        });
        if (response.ok) setSuggestions((await response.json()).entries ?? []);
      } catch {
        /* aborted */
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  /**
   * Landkaarten, dossiers, tijdlijnen and (§52) other prikborden matching what
   * is typed, and not already up. Matched here rather than asked for: you have
   * a dozen landkaarten, not a thousand.
   */
  const otherMatches = useMemo(() => {
    const typed = search.trim();
    if (!typed) return { maps: [], cases: [], timelines: [], boards: [] };
    const onWall = {
      map: new Set(cards.filter((card) => card.kind === 'map').map((card) => card.mapId)),
      case: new Set(cards.filter((card) => card.kind === 'case').map((card) => card.caseId)),
      timeline: new Set(cards.filter((card) => card.kind === 'timeline').map((card) => card.timelineId)),
      board: new Set(cards.filter((card) => card.kind === 'board').map((card) => card.boardId)),
    };
    const pick = <T extends PickableItem>(list: T[], up: Set<unknown>) =>
      list
        .filter((item) => !up.has(item.id))
        .map((item) => ({ item, score: fuzzyScore(item.name, typed) }))
        .filter((row) => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((row) => row.item);
    return {
      maps: pick(pickableMaps, onWall.map),
      cases: pick(pickableCases, onWall.case),
      timelines: pick(pickableTimelines, onWall.timeline),
      boards: pick(pickableBoards, onWall.board),
    };
  }, [search, cards, pickableMaps, pickableCases, pickableTimelines, pickableBoards]);

  const typed = search.trim();

  /** Every pick clears the box: the picker is finished with, either way. */
  const after = (run: () => void) => {
    run();
    setSearch('');
    setSuggestions([]);
  };

  const row = (
    key: string,
    icon: string,
    colour: string,
    name: string,
    label: string,
    onPick: () => void,
  ) => (
    <li key={key}>
      <button type="button" className="suggest-item" onClick={() => after(onPick)}>
        <Icon name={icon} size={16} style={{ color: colour }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong>{name}</strong>
          <span className="tiny muted" style={{ display: 'block' }}>
            {label}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div
      className={variant === 'float' ? 'board-picker board-picker-float' : 'board-picker'}
      style={style}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !onCancel) return;
        event.stopPropagation();
        onCancel();
      }}
    >
      {/*
        Two labels, because both pickers can be on the screen at once and a
        label that reads the same twice is a label that names neither.
      */}
      <label className="visually-hidden" htmlFor={`board-search${variant === 'float' ? '-here' : ''}`}>
        {variant === 'float'
          ? `${capitalise(ui.words.card)} hier vastknopen`
          : `${capitalise(ui.words.card)} toevoegen`}
      </label>
      <input
        ref={inputRef}
        id={`board-search${variant === 'float' ? '-here' : ''}`}
        className="input"
        value={search}
        placeholder={`Zoek een ${ui.words.entry}, landkaart, ${ui.words.case}, ${ui.words.board} of ${ui.words.timeline}…`}
        onChange={(event) => setSearch(event.target.value)}
      />
      {typed && (
        <ul className="suggest-list" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}>
          {suggestions.map((item) =>
            row(item.id, item.typeIcon, item.typeColour, item.name, item.typeLabel, () =>
              onPickEntry(item),
            ),
          )}

          {otherMatches.maps.map((item) =>
            row(`map-${item.id}`, 'map', 'var(--ink-muted)', item.name, 'Landkaart', () =>
              onPickMap(item),
            ),
          )}
          {otherMatches.cases.map((item) =>
            row(`case-${item.id}`, 'folder', 'var(--ink-muted)', item.name, capitalise(ui.words.case), () =>
              onPickCase(item),
            ),
          )}
          {otherMatches.timelines.map((item) =>
            row(
              `timeline-${item.id}`,
              'timeline',
              'var(--ink-muted)',
              item.name,
              capitalise(ui.words.timeline),
              () => onPickTimeline(item),
            ),
          )}
          {/* §52: and the other walls. */}
          {otherMatches.boards.map((item) =>
            row(`board-${item.id}`, 'board', 'var(--ink-muted)', item.name, capitalise(ui.words.board), () =>
              onPickBoard(item),
            ),
          )}

          {/*
            The way out when nothing above is what you meant, and only on the
            floating picker.

            A string let go in the void has to be answerable there and then —
            that is the whole point of it — so it offers to write the artikel
            as well. The bar at the top of the wall does not: a row that makes
            something appears *before* the search has answered, and a hand
            reaching for the artikel it just typed would keep landing on
            "aanmaken" instead. The bar keeps the one create row it has always
            had, at the foot of the list where it has always been.
          */}
          {variant === 'float' && (
          <li>
            <button type="button" className="suggest-item" onClick={() => after(() => onCreateEntry(typed))}>
              <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
              <span>
                &lsquo;<strong>{typed}</strong>&rsquo; aanmaken
              </span>
            </button>
          </li>
          )}
          <li>
            <button type="button" className="suggest-item" onClick={() => after(() => onCreateNote(typed))}>
              <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
              <span>
                &lsquo;<strong>{typed}</strong>&rsquo; als {ui.words.note} toevoegen
              </span>
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
