'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSuggestKeys } from '@/components/ui/useSuggestKeys';
import { useFloatBox } from '@/components/canvas/useFloatBox';
import { clampInside } from '@/lib/canvas/clamp';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import { fuzzyScore } from '@/lib/search/fuzzy';
import type { BoardCard } from '@/lib/boards/merge';
import { SUGGEST_DEBOUNCE_MS } from '@/lib/search/suggest';
import { findOnCanvas, type Findable } from '@/lib/canvas/find';

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
  holding = false,
  pickableMaps,
  pickableCases,
  pickableTimelines,
  pickableBoards,
  pickableFamilyTrees,
  onPickEntry,
  onPickMap,
  onPickCase,
  onPickTimeline,
  onPickBoard,
  onPickFamilyTree,
  onCreateNote,
  onCreateEntry,
  onCancel,
  style,
  findable,
  findGroup,
  onFind,
}: {
  /**
   * `bar` is the search box in the board's toolbar, which is always there and
   * shows its list underneath. `float` is the one that opens where a string
   * was dropped: it takes focus, closes on Escape, and is anchored by `style`.
   */
  variant: 'bar' | 'float';
  /** What is already on the wall, so the same thing is not offered twice. */
  cards: BoardCard[];
  /**
   * §64: a bare punaise is still waiting on the end of a draad, so whatever is
   * picked here lands on *that* rather than in the middle of the view.
   *
   * Only the bar asks for this. The floating box is always standing on the
   * punaise it opened for and says so in its own label, but the bar is the box a
   * reader reaches for after the floating one has closed — and a card that
   * quietly flies to the other side of the wall is a behaviour that reads as a
   * bug the first time it happens. So it is said out loud, above the list.
   */
  holding?: boolean;
  pickableMaps: PickableItem[];
  pickableCases: PickableItem[];
  pickableTimelines: PickableItem[];
  pickableBoards: PickableItem[];
  /** §66: the stambomen this viewer may hang up. */
  pickableFamilyTrees: PickableItem[];
  onPickEntry: (entry: SuggestedEntry) => void;
  onPickMap: (item: PickableItem) => void;
  onPickCase: (item: PickableItem) => void;
  onPickTimeline: (item: PickableItem) => void;
  onPickBoard: (item: PickableItem) => void;
  onPickFamilyTree: (item: PickableItem) => void;
  onCreateNote: (name: string) => void;
  onCreateEntry: (name: string) => void;
  /** Escape, or a click on nothing. Only the floating one has one. */
  onCancel?: () => void;
  style?: React.CSSProperties;
  /**
   * §94 (C4): what already hangs on this wall, by the name it shows. The bar
   * lists the matches as its **top** group ("Op dit prikbord"); a pick zooms to
   * the card and chooses it rather than hanging a second one.
   */
  findable?: Findable[];
  findGroup?: string;
  onFind?: (cardId: string) => void;
}) {
  const ui = useUi();
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  /*
   * §69 (5.2/5.4): de wortel van de kiezer. Twee dingen hangen eraan — de
   * pijltjes moeten de rijen kunnen vinden, en de zwevende variant moet zich
   * aan het glas kunnen klemmen.
   */
  const rootRef = useRef<HTMLDivElement>(null);

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
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  /**
   * Landkaarten, dossiers, tijdlijnen, (§52) other prikborden and (§66)
   * stambomen matching what is typed, and not already up. Matched here rather
   * than asked for: you have a dozen landkaarten, not a thousand.
   */
  const otherMatches = useMemo(() => {
    const typed = search.trim();
    if (!typed) return { maps: [], cases: [], timelines: [], boards: [], familyTrees: [] };
    const onWall = {
      map: new Set(cards.filter((card) => card.kind === 'map').map((card) => card.mapId)),
      case: new Set(cards.filter((card) => card.kind === 'case').map((card) => card.caseId)),
      timeline: new Set(cards.filter((card) => card.kind === 'timeline').map((card) => card.timelineId)),
      board: new Set(cards.filter((card) => card.kind === 'board').map((card) => card.boardId)),
      family_tree: new Set(
        cards.filter((card) => card.kind === 'family_tree').map((card) => card.familyTreeId),
      ),
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
      familyTrees: pick(pickableFamilyTrees, onWall.family_tree),
    };
  }, [
    search,
    cards,
    pickableMaps,
    pickableCases,
    pickableTimelines,
    pickableBoards,
    pickableFamilyTrees,
  ]);

  const typed = search.trim();
  const found = useMemo(
    () => (variant === 'bar' && findable && onFind ? findOnCanvas(findable, typed, 5) : []),
    [variant, findable, onFind, typed],
  );

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

  /* §69 (5.2): ↑ ↓ en Enter, zoals in de andere vier kiezers. */
  const keys = useSuggestKeys({ open: Boolean(typed), ref: rootRef });

  /*
   * §69 (5.4): de zwevende kiezer klemt zich op zijn **gemeten** maat.
   *
   * `BoardCanvas` kiest waar hij hoort te staan — naast de punaise, zodat de
   * kop en zijn labeltje blijven waar de hand ze liet — en klemde dat tegen
   * twee getallen die het raadde: een breedte van 336 waar de stylesheet 320
   * zegt, en een hoogte van 90 voor een vak dat met zes suggesties erin ruim
   * 300 is. De kurk knipt af (`overflow: hidden`), dus dat was een kiezer
   * waarvan de onderste rijen er domweg niet waren. Hier is de maat bekend, en
   * hier wordt hij dus gemeten.
   *
   * Alleen de zwevende: de vaste variant staat in de werkbalk, in de stroom
   * van de pagina, en heeft niets te klemmen.
   */
  const floating = variant === 'float';
  const box = useFloatBox(rootRef, { width: 320, height: 300 });
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);
  const wish = style as { left?: number; top?: number } | undefined;
  const wishLeft = wish?.left;
  const wishTop = wish?.top;
  useLayoutEffect(() => {
    if (!floating || typeof wishLeft !== 'number' || typeof wishTop !== 'number') {
      setPlaced(null);
      return;
    }
    const glass = rootRef.current?.offsetParent as HTMLElement | null;
    if (!glass) return;
    const next = clampInside(
      { x: wishLeft, y: wishTop },
      box,
      { width: glass.clientWidth, height: glass.clientHeight },
    );
    setPlaced((current) =>
      current && current.left === next.left && current.top === next.top ? current : next,
    );
  }, [floating, wishLeft, wishTop, box]);

  return (
    <div
      ref={rootRef}
      className={variant === 'float' ? 'board-picker board-picker-float' : 'board-picker'}
      style={placed ? { ...style, ...placed } : style}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onCancel) {
          event.stopPropagation();
          onCancel();
          return;
        }
        keys.onKeyDown(event);
      }}
    >
      {/*
        Two labels, because both pickers can be on the screen at once and a
        label that reads the same twice is a label that names neither.
      */}
      {/*
        The label never moves with `holding`. Four e2e specs reach this box by
        `getByLabel('Kaart toevoegen')`, and a control that renames itself when
        the wall happens to be holding a lead is a control nothing can find.
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
        /*
         * §64: the notice lives in the placeholder, and that is not a shortcut.
         *
         * It was a line of its own under the box for one round, and it cost the
         * suite a spec: `.board-tools` is laid out *above* `.board-viewport`, so a
         * paragraph that appears when a draad is dropped makes the whole wall
         * jump down by its height — under the hand that is still working, and out
         * from under every coordinate anything had measured. Nothing that can
         * turn on and off in the toolbar may take up room. A placeholder takes
         * none, and it is where the reader is already looking.
         */
        placeholder={
          holding
            ? `Zoek wat er aan de ${ui.words.string} komt…`
            : `Zoek een ${ui.words.entry}, landkaart, ${ui.words.case}, ${ui.words.board}, ${ui.words.timeline} of ${ui.words.familyTree}…`
        }
        aria-describedby={holding ? `board-search-holding${variant}` : undefined}
        onChange={(event) => setSearch(event.target.value)}
      />
      {/*
        And the same sentence in full for a screen reader. `.visually-hidden` is
        `position: absolute`, so this one is out of flow and cannot move the wall.
      */}
      {holding && (
        <p className="visually-hidden" id={`board-search-holding${variant}`}>
          Wat je kiest komt aan de {ui.words.string} die nog wacht.
        </p>
      )}
      {typed && (
        <ul className="suggest-list" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}>
          {/* §94 (C4): what is already up comes first — finding before adding. */}
          {found.length > 0 && (
            <li className="suggest-group tiny muted" data-testid="board-find-group">
              {findGroup}
            </li>
          )}
          {found.map((item) =>
            row(`on-${item.id}`, item.icon ?? 'crosshair', 'var(--ink-muted)', item.name, item.hint ?? '', () =>
              onFind?.(item.id),
            ),
          )}
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
          {/* §66: and the stambomen. */}
          {otherMatches.familyTrees.map((item) =>
            row(
              `family_tree-${item.id}`,
              'tree',
              'var(--ink-muted)',
              item.name,
              capitalise(ui.words.familyTree),
              () => onPickFamilyTree(item),
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
