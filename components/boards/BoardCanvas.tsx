'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { assetUrl } from '@/components/Cover';
import { borderLabel } from '@/components/borders';
import { Icon } from '@/components/Icon';
import { AccessEditor, type AccessSettings } from '@/components/access/AccessEditor';
import { Sheet } from '@/components/ui/Sheet';
import { useIsPhone } from '@/components/useIsPhone';
import { useUi } from '@/components/ui/UiProvider';
import { capitalise } from '@/lib/words';
import {
  boardBounds,
  CARD_SIZE,
  cardSize,
  endpointsEqual,
  headOf,
  isCardEnd,
  placementRotation,
  sameEnds,
  stringColourValue,
  type BoardCard,
  type BoardState,
  type BoardString,
  type Endpoint,
  type StringColour,
  type Viewport,
} from '@/lib/boards/merge';
import type { BoardEntryFacts } from '@/lib/boards/service';
import { BoardCardView, CARD_WIDTH, cardBorder, cardImage } from './BoardCard';
import { BoardInspector } from './BoardInspector';
import { BoardTray, type TrayEntry } from './BoardTray';
import { syncLabel, useBoardSync } from './useBoardSync';
import { useBoardLive } from './useBoardLive';
import { uploadForm } from '@/lib/upload';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const UNDO_LIMIT = 50;
/** Size of the SVG layer the red string is drawn on, centred on the origin. */
const STRING_LAYER = 40000;

type Snapshot = { cards: BoardCard[]; strings: BoardString[] };

/**
 * A string being run, whether it is a new one from a card's pin or an existing
 * end being taken off its card and put somewhere else. Both are the same
 * gesture — hold one end still, drag the other — so they are the same state.
 */
type Drawing = {
  /** The end that stays put. */
  anchor: Endpoint;
  /** Where the dragged end currently is, in board coordinates. */
  x: number;
  y: number;
  /** Set when an existing string's end is being moved rather than a new one run. */
  editing?: { id: string; end: 'from' | 'to' };
};

function newCardId() {
  return `c_${Math.random().toString(36).slice(2, 12)}`;
}
function newStringId() {
  return `s_${Math.random().toString(36).slice(2, 12)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The curve of a slack piece of string between two pins. */
function stringPath(ax: number, ay: number, bx: number, by: number) {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const sag = Math.min(60, Math.hypot(bx - ax, by - ay) * 0.16);
  return `M ${ax} ${ay} Q ${midX} ${midY + sag} ${bx} ${by}`;
}

function sagOf(ax: number, ay: number, bx: number, by: number) {
  return Math.min(60, Math.hypot(bx - ax, by - ay) * 0.16);
}

export function BoardCanvas({
  boardId,
  boardName,
  caseId,
  caseName,
  caseSlug,
  caseEntries,
  initialState,
  initialEntries,
  readOnly,
  access,
}: {
  boardId: string;
  boardName: string;
  /** §17: may look, not touch. Every write path below is switched off. */
  readOnly: boolean;
  access: {
    settings: AccessSettings;
    canManage: boolean;
    isKeeper: boolean;
    viewerId: string;
  };
  /** The case this board belongs to, if any — the filing prompt needs it. */
  caseId: string | null;
  caseName: string | null;
  caseSlug: string | null;
  /** Everything filed in that case: the tray's source, and the filing prompt's. */
  caseEntries: TrayEntry[];
  initialState: BoardState;
  initialEntries: Record<string, BoardEntryFacts>;
}) {
  const ui = useUi();
  const router = useRouter();
  const isPhone = useIsPhone();

  const [cards, setCards] = useState<BoardCard[]>(initialState.cards);
  const [strings, setStrings] = useState<BoardString[]>(initialState.strings);
  const [entries, setEntries] = useState<Record<string, BoardEntryFacts>>(initialEntries);
  const [viewport, setViewport] = useState<Viewport>(initialState.viewport);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedStringId, setSelectedStringId] = useState<string | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    assetId: string;
    name: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState(boardName);

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<
    {
      id: string;
      name: string;
      typeIcon: string;
      typeColour: string;
      typeLabel: string;
    }[]
  >([]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Which card an incoming file belongs to, or 'new' for a fresh photo card. */
  const photoTarget = useRef<string | 'new'>('new');
  const undoStack = useRef<Snapshot[]>([]);
  const dragMoved = useRef(false);
  /** Which card was already selected when the current press began. */
  const pressWasSelected = useRef<string | null>(null);
  /** Entry ids already filed in this board's case; kept up to date as we file. */
  const filed = useRef<Set<string>>(new Set(caseEntries.map((entry) => entry.id)));
  /** The card an in-flight tray drag is carrying. */
  const dragging = useRef<TrayEntry | null>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    origin: Map<string, { x: number; y: number }>;
    /** The board before the press, pushed to undo only once something moves. */
    before: Snapshot;
  } | null>(null);
  const cropDrag = useRef<{
    startX: number;
    startY: number;
    from: { x: number; y: number; zoom: number };
  } | null>(null);
  const pan = useRef<{ startX: number; startY: number; from: Viewport } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // §8: no dragging or string-drawing on screens under 768 px. Selecting and
  // editing still work, or the inspector would be unreachable on a phone.
  const interactive = !isPhone && !readOnly;
  const [accessOpen, setAccessOpen] = useState(false);

  /**
   * §8, live: this tab. One person with the board open twice is two hands on
   * the wall, which is what they will see, so the id belongs to the tab rather
   * than the account. Generated once and never re-generated — a new id on every
   * render would look like somebody new arriving sixty times a second.
   */
  const clientIdRef = useRef<string>('');
  if (!clientIdRef.current) clientIdRef.current = `t_${Math.random().toString(36).slice(2, 12)}`;
  const clientId = clientIdRef.current;

  const busy = Boolean(drag.current || cropDrag.current || drawing || marquee);

  /**
   * Applying someone else's version of the board. Shared with the save path,
   * because "the merge came back from my save" and "the merge came back because
   * Bram moved something" want exactly the same thing done with them.
   */
  const applyRemote = useCallback((state: BoardState, freshEntries: Record<string, BoardEntryFacts>) => {
    setCards(state.cards);
    setStrings(state.strings);
    setEntries((current) => ({ ...current, ...freshEntries }));
    // A card someone else deleted must not stay selected here: the inspector
    // would be editing something that no longer exists.
    const alive = new Set(state.cards.map((card) => card.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => alive.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectedStringId((current) =>
      current && state.strings.some((line) => line.id === current) ? current : null,
    );
    setCroppingId((current) => (current && alive.has(current) ? current : null));
  }, []);

  const sync = useBoardSync({
    boardId,
    clientId,
    cards,
    strings,
    viewport,
    paused: busy,
    onMerged: applyRemote,
  });

  /**
   * The other half: what everybody else is doing. `dirty` covers the save that
   * is queued or in flight — pulling on top of unsaved local work would throw
   * it away, and the save is about to return the merge anyway.
   */
  const live = useBoardLive({
    boardId,
    clientId,
    holding: useMemo(() => [...selected], [selected]),
    paused: busy,
    dirty: sync.state === 'dirty' || sync.state === 'saving',
    onRemote: applyRemote,
    onRename: (remoteName) => {
      // Not while it is being typed in: the caret would jump.
      if (document.activeElement?.id === 'board-name') return;
      setName((current) => (current === remoteName ? current : remoteName));
    },
  });

  const pushUndo = useCallback(() => {
    undoStack.current.push({ cards, strings });
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
  }, [cards, strings]);

  const commit = useCallback(
    (next: Partial<Snapshot>, options: { undo?: boolean } = {}) => {
      if (readOnly) return;
      if (options.undo !== false) pushUndo();
      if (next.cards) setCards(next.cards);
      if (next.strings) setStrings(next.strings);
      sync.markDirty();
    },
    [pushUndo, sync, readOnly],
  );

  const undo = useCallback(() => {
    if (readOnly) return;
    const previous = undoStack.current.pop();
    if (!previous) return;
    // Anything undo brings back must not still be queued for deletion, and the
    // server has to be told to lift the tombstone it wrote when the deletion
    // was first saved — otherwise the card reappears here and is swept away
    // again on the next save.
    sync.noteRestored(
      previous.cards.map((card) => card.id),
      previous.strings.map((line) => line.id),
    );
    setCards(previous.cards);
    setStrings(previous.strings);
    setSelected(new Set());
    setSelectedStringId(null);
    if (!readOnly) sync.markDirty();
  }, [sync]);

  /* ------------------------------------------------------------ geometry */

  const toBoard = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - viewport.x) / viewport.zoom,
        y: (clientY - rect.top - viewport.y) / viewport.zoom,
      };
    },
    [viewport],
  );

  const centreOfView = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 200, y: 200 };
    return toBoard(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [toBoard]);

  /**
   * §8, live: the cards as they are *seen*. A card someone else is dragging is
   * drawn where their hand has it right now, not where the last save left it
   * — the strings tied to it follow, and so does the hit test, because what
   * you see is what you can point at. `cards` itself is untouched: it is what
   * gets saved, and another person's drag is not ours to save.
   */
  const shownCards = useMemo(() => {
    if (!live.carried.size) return cards;
    return cards.map((card) => {
      const held = live.carried.get(card.id);
      return held && !selected.has(card.id) ? { ...card, x: held.x, y: held.y } : card;
    });
  }, [cards, live.carried, selected]);

  const cardById = useMemo(() => new Map(shownCards.map((card) => [card.id, card])), [shownCards]);

  /** Where an end of a string sits on the cork. Null if its card has gone. */
  const pointOf = useCallback(
    (end: Endpoint): { x: number; y: number } | null => {
      if (!isCardEnd(end)) return { x: end.x, y: end.y };
      const card = cardById.get(end.card);
      return card ? headOf(card) : null;
    },
    [cardById],
  );

  /** The topmost card — or pin — under a board point, or null for bare cork. */
  const cardAt = useCallback(
    (x: number, y: number) =>
      [...shownCards].reverse().find((card) => {
        const size = cardSize(card);
        return x >= card.x && x <= card.x + size.width && y >= card.y && y <= card.y + size.height;
      }) ?? null,
    [shownCards],
  );

  /**
   * A bare pin whose head sits exactly where a string end was dropped. A lead
   * that goes somewhere you have not named yet gets a pin of its own on the
   * wall, which can then be dragged, labelled, and have more string tied to it.
   */
  const pinAt = useCallback((x: number, y: number): BoardCard => {
    const head = headOf({ kind: 'pin', x: 0, y: 0 });
    return {
      id: newCardId(),
      kind: 'pin',
      entryId: null,
      assetId: null,
      crop: null,
      border: null,
      showImage: false,
      name: '',
      text: '',
      x: Math.round(x - head.x),
      y: Math.round(y - head.y),
      rotation: 0,
    };
  }, []);

  const selectedCards = useMemo(
    () => cards.filter((card) => selected.has(card.id)),
    [cards, selected],
  );
  const selectedString = useMemo(
    () => strings.find((line) => line.id === selectedStringId) ?? null,
    [strings, selectedStringId],
  );

  /* ----------------------------------------------------------- mutations */

  /**
   * §8 puts a new card at the viewport centre. Dropping every card on the exact
   * same spot buries the last one and its pin, so it steps outward on a grid,
   * preferring somewhere still on screen.
   */
  const freeSpotNear = useCallback(
    (cx: number, cy: number, size: { width: number; height: number }) => {
      const stepX = size.width + 28;
      const stepY = size.height + 28;
      const clear = (x: number, y: number) =>
        !cards.some((card) => {
          const other = cardSize(card);
          return (
            x < card.x + other.width &&
            x + size.width > card.x &&
            y < card.y + other.height &&
            y + size.height > card.y
          );
        });

      const rect = viewportRef.current?.getBoundingClientRect();
      const view = rect
        ? {
            left: -viewport.x / viewport.zoom,
            top: -viewport.y / viewport.zoom,
            right: (rect.width - viewport.x) / viewport.zoom,
            bottom: (rect.height - viewport.y) / viewport.zoom,
          }
        : null;
      const onScreen = (x: number, y: number) =>
        !view ||
        (x >= view.left &&
          y >= view.top &&
          x + size.width <= view.right &&
          y + size.height <= view.bottom);

      const originX = Math.round(cx - size.width / 2);
      const originY = Math.round(cy - size.height / 2);
      if (clear(originX, originY)) return { x: originX, y: originY };

      let fallback: { x: number; y: number } | null = null;
      for (let ring = 1; ring <= 12; ring++) {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const x = originX + dx * stepX;
            const y = originY + dy * stepY;
            if (!clear(x, y)) continue;
            if (onScreen(x, y)) return { x, y };
            fallback ??= { x, y };
          }
        }
      }
      return fallback ?? { x: originX, y: originY };
    },
    [cards, viewport],
  );

  type NewCard = Pick<BoardCard, 'id' | 'kind' | 'name' | 'text'> & Partial<BoardCard>;

  const addCard = useCallback(
    (card: NewCard) => {
      const centre = centreOfView();
      const spot = freeSpotNear(centre.x, centre.y, cardSize(card));
      const placed: BoardCard = {
        entryId: null,
        assetId: null,
        crop: null,
        border: null,
        showImage: card.kind !== 'pin',
        ...card,
        x: card.x ?? spot.x,
        y: card.y ?? spot.y,
        // A pin stands straight; only paper gets the slight tilt.
        rotation: card.kind === 'pin' ? 0 : placementRotation(),
      };
      commit({ cards: [...cards, placed] });
      return placed;
    },
    [cards, centreOfView, commit, freeSpotNear],
  );

  const patchCard = useCallback(
    (cardId: string, patch: Partial<BoardCard>) => {
      commit({
        cards: cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
      });
    },
    [cards, commit],
  );

  const patchString = useCallback(
    (stringId: string, patch: Partial<BoardString>) => {
      commit({
        strings: strings.map((line) => (line.id === stringId ? { ...line, ...patch } : line)),
      });
    },
    [strings, commit],
  );

  const removeCards = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const doomed = new Set(ids);
      // A string tied to a card that is going has to go too; one tied to a bare
      // point at the other end keeps that end, so it goes as a whole.
      const touches = (line: BoardString) =>
        (isCardEnd(line.from) && doomed.has(line.from.card)) ||
        (isCardEnd(line.to) && doomed.has(line.to.card));

      const removedCards = cards.filter((card) => doomed.has(card.id));
      const removedStrings = strings.filter(touches);

      for (const card of removedCards) sync.noteDeletedCard(card.id);
      for (const line of removedStrings) sync.noteDeletedString(line.id);

      commit({
        cards: cards.filter((card) => !doomed.has(card.id)),
        strings: strings.filter((line) => !touches(line)),
      });
      setSelected(new Set());
      setCroppingId(null);

      ui.toast(
        `${removedCards.length === 1 ? 'Kaart' : `${removedCards.length} kaarten`} verwijderd.`,
        { label: 'Ongedaan maken', onAction: () => undo() },
      );
    },
    [cards, strings, commit, sync, ui, undo],
  );

  const removeString = useCallback(
    (stringId: string) => {
      const line = strings.find((item) => item.id === stringId);
      if (!line) return;
      sync.noteDeletedString(stringId);
      commit({ strings: strings.filter((item) => item.id !== stringId) });
      setSelectedStringId(null);
      ui.toast('Draad verwijderd.', { label: 'Ongedaan maken', onAction: () => undo() });
    },
    [strings, commit, sync, ui, undo],
  );

  /* ------------------------------------------------------- filing prompt */

  /**
   * A board hanging off a case is that case's wall. Pinning someone to it
   * almost always means they belong in the file too — but not always, so this
   * asks rather than doing it, and only when the entry is not already filed.
   */
  const offerToFile = useCallback(
    (entryId: string, entryName: string) => {
      if (!caseId || filed.current.has(entryId)) return;
      const words = ui.words;
      const dossier = caseName ?? `dit ${words.case}`;
      // A sheet, not a toast: this is the one question the wall has to ask,
      // and a line in the corner was too easy to miss.
      void ui
        .confirm({
          title: `${entryName} zit nog niet in ${dossier}`,
          message: (
            <>
              De {words.card} hangt nu op het {words.board}. Wil je {entryName} ook bij de{' '}
              {words.entryPlural} van {dossier} zetten?
            </>
          ),
          confirmLabel: `Toevoegen aan ${words.case}`,
          cancelLabel: 'Alleen prikken',
        })
        .then((yes) => {
          if (!yes) return;
          filed.current.add(entryId);
          void fetch(`/api/cases/${caseId}/entries`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entryId }),
          }).then((response) => {
            if (response.ok) {
              ui.toast(`${entryName} toegevoegd aan ${dossier}.`);
              router.refresh();
            } else {
              filed.current.delete(entryId);
              ui.toast('Opslaan is niet gelukt. Probeer het opnieuw.');
            }
          });
        });
    },
    [caseId, caseName, router, ui],
  );

  /* -------------------------------------------------------------- photos */

  const askForPhoto = useCallback((target: string | 'new') => {
    photoTarget.current = target;
    fileRef.current?.click();
  }, []);

  const uploadPhoto = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
        if (!result.ok) {
          ui.toast(result.error);
          return;
        }
        const data = result.data;

        const fresh = { x: 0.5, y: 0.5, zoom: 1 };
        if (photoTarget.current === 'new') {
          const placed = addCard({
            id: newCardId(),
            kind: 'photo',
            assetId: data.asset.id,
            crop: fresh,
            name: file.name.replace(/\.[^.]+$/, ''),
            text: '',
          });
          setSelected(new Set([placed.id]));
          setSelectedStringId(null);
          setCroppingId(placed.id);
        } else {
          const cardId = photoTarget.current;
          patchCard(cardId, {
            assetId: data.asset.id,
            crop: fresh,
            showImage: true,
          });
          setCroppingId(cardId);
        }
      } finally {
        setUploading(false);
      }
    },
    [addCard, patchCard, ui],
  );

  /* ------------------------------------------------------------- pointer */

  function selectCard(cardId: string, additive: boolean) {
    setSelectedStringId(null);
    setSelected((current) => {
      const next = new Set(additive ? current : []);
      if (additive && next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function onCardPointerDown(event: React.PointerEvent, cardId: string) {
    if (event.button !== 0) return;

    // While cropping, dragging inside the card moves the picture, not the card.
    if (croppingId === cardId) {
      const card = cardById.get(cardId);
      if (!card) return;
      cropDrag.current = {
        startX: event.clientX,
        startY: event.clientY,
        from: card.crop ?? { x: 0.5, y: 0.5, zoom: 1 },
      };
      return;
    }

    if (croppingId) setCroppingId(null);

    const additive = event.shiftKey;
    const alreadySelected = selected.has(cardId);
    pressWasSelected.current = alreadySelected ? cardId : null;
    if (!additive && !alreadySelected) selectCard(cardId, false);
    else selectCard(cardId, additive);

    if (!interactive) return;

    const chosen = new Set(additive || alreadySelected ? selected : []);
    chosen.add(cardId);
    const origin = new Map<string, { x: number; y: number }>();
    for (const card of cards)
      if (chosen.has(card.id)) origin.set(card.id, { x: card.x, y: card.y });

    dragMoved.current = false;
    // Not pushed to undo yet: a click, or the first half of a double-click, is
    // a press too, and undo should not be full of drags that went nowhere.
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin,
      before: { cards, strings },
    };
  }

  function onPinPointerDown(event: React.PointerEvent, cardId: string) {
    if (!interactive) return;
    const point = toBoard(event.clientX, event.clientY);
    setSelected(new Set());
    setSelectedStringId(null);
    setDrawing({ anchor: { card: cardId }, x: point.x, y: point.y });
  }

  /** Taking one end of an already-drawn string off its card to move it. */
  function onEndHandlePointerDown(
    event: React.PointerEvent,
    line: BoardString,
    end: 'from' | 'to',
  ) {
    if (!interactive) return;
    event.stopPropagation();
    const point = toBoard(event.clientX, event.clientY);
    pushUndo();
    setDrawing({
      anchor: end === 'from' ? line.to : line.from,
      x: point.x,
      y: point.y,
      editing: { id: line.id, end },
    });
  }

  function onStringPointerDown(event: React.PointerEvent, stringId: string) {
    event.stopPropagation();
    setSelected(new Set());
    setCroppingId(null);
    setSelectedStringId(stringId);
  }

  function onSurfacePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest('.board-card') ||
      target.closest('.board-inspector') ||
      target.closest('.board-end-handle')
    ) {
      return;
    }

    setSelected(new Set());
    setSelectedStringId(null);
    setCroppingId(null);

    if (event.shiftKey && interactive) {
      const point = toBoard(event.clientX, event.clientY);
      setMarquee({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
      return;
    }

    pan.current = {
      startX: event.clientX,
      startY: event.clientY,
      from: viewport,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    // §8, live: where this hand is, for everyone else's wall. A finger has no
    // hover, so touch only reports while it is actually dragging a card.
    if (event.pointerType !== 'touch' && live.state === 'live') {
      live.reportPointer({ cursor: toBoard(event.clientX, event.clientY) });
    }

    if (cropDrag.current && croppingId) {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const state = cropDrag.current;
      // The frame is CARD_WIDTH wide at zoom 1; dragging right moves the
      // picture right, so the focal point moves left.
      const dx = (event.clientX - state.startX) / viewport.zoom / CARD_WIDTH / state.from.zoom;
      const dy =
        (event.clientY - state.startY) / viewport.zoom / ((CARD_WIDTH * 4) / 3) / state.from.zoom;
      const next = {
        x: clamp(state.from.x - dx, 0, 1),
        y: clamp(state.from.y - dy, 0, 1),
        zoom: state.from.zoom,
      };
      sync.touch();
      setCards((current) =>
        current.map((card) => (card.id === croppingId ? { ...card, crop: next } : card)),
      );
      return;
    }

    if (drag.current) {
      const dx = (event.clientX - drag.current.startX) / viewport.zoom;
      const dy = (event.clientY - drag.current.startY) / viewport.zoom;
      if (!dragMoved.current && Math.abs(dx) + Math.abs(dy) > 4) {
        dragMoved.current = true;
        undoStack.current.push(drag.current.before);
        if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      }
      sync.touch();
      const origin = drag.current.origin;
      const moving: Record<string, { x: number; y: number }> = {};
      for (const [id, from] of origin) moving[id] = { x: Math.round(from.x + dx), y: Math.round(from.y + dy) };
      // Everyone else sees the cards travel with the hand, not just land.
      if (dragMoved.current && live.state === 'live') live.reportPointer({ moving });
      setCards((current) =>
        current.map((card) => {
          const at = moving[card.id];
          return at ? { ...card, x: at.x, y: at.y } : card;
        }),
      );
      return;
    }

    if (pan.current) {
      // Read the ref here, not inside the updater: React runs updaters later —
      // twice over in Strict Mode — by which time pointerup has cleared it.
      const { from, startX, startY } = pan.current;
      const nextX = from.x + (event.clientX - startX);
      const nextY = from.y + (event.clientY - startY);
      setViewport((current) => ({ ...current, x: nextX, y: nextY }));
      return;
    }

    if (drawing) {
      const point = toBoard(event.clientX, event.clientY);
      setDrawing({ ...drawing, x: point.x, y: point.y });
      return;
    }

    if (marquee) {
      const point = toBoard(event.clientX, event.clientY);
      setMarquee({ ...marquee, x1: point.x, y1: point.y });
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    if (cropDrag.current) {
      cropDrag.current = null;
      if (!readOnly) sync.markDirty();
      return;
    }

    if (drag.current) {
      const moved = dragMoved.current;
      drag.current = null;
      // The drop is the one save everyone else is waiting on: they have been
      // watching this card travel, and its final place should not lag behind
      // the hand by a debounce.
      if (!readOnly) {
        if (moved) sync.saveNow();
        else sync.markDirty();
      }
      return;
    }

    if (pan.current) {
      pan.current = null;
      if (!readOnly) sync.markDirty();
      return;
    }

    if (drawing) {
      // Hit-test by geometry rather than by DOM target: a card sitting under
      // another one, or a transparent overlay, would otherwise swallow the drop.
      const point = toBoard(event.clientX, event.clientY);
      const hit = cardAt(point.x, point.y);
      // On a card or a pin, tie to it. On bare cork, push a new pin in right
      // there and tie to that: a lead that goes somewhere you have not named
      // yet gets a place on the wall, and the pin can be moved and labelled.
      const fresh = hit ? null : pinAt(point.x, point.y);
      const end: Endpoint = { card: hit ? hit.id : fresh!.id };
      let nextCards = fresh ? [...cards, fresh] : cards;

      // One string between any two things. Landing on a pair that is already
      // joined selects the string that joins them rather than adding a twin.
      const twin = strings.find(
        (item) =>
          item.id !== drawing.editing?.id && sameEnds(item, { from: drawing.anchor, to: end }),
      );
      if (twin) {
        // Nothing changed, so the grip's undo entry has nothing to undo.
        if (drawing.editing) undoStack.current.pop();
        setSelectedStringId(twin.id);
        setDrawing(null);
        ui.toast('Die twee zijn al met elkaar verbonden.');
        return;
      }

      if (!endpointsEqual(end, drawing.anchor)) {
        if (drawing.editing) {
          const { id, end: which } = drawing.editing;
          const line = strings.find((item) => item.id === id);
          const nextStrings = strings.map((item) =>
            item.id === id ? { ...item, [which]: end } : item,
          );
          // Pulling the string off a bare, unlabelled pin that nothing else is
          // tied to takes the pin out with it — nobody leaves an empty pin in
          // the wall on purpose.
          const left = line?.[which];
          if (left && isCardEnd(left)) {
            const pin = cardById.get(left.card);
            const stillUsed = nextStrings.some(
              (item) =>
                (isCardEnd(item.from) && item.from.card === left.card) ||
                (isCardEnd(item.to) && item.to.card === left.card),
            );
            if (pin && pin.kind === 'pin' && !pin.name && !stillUsed) {
              nextCards = nextCards.filter((item) => item.id !== pin.id);
              sync.noteDeletedCard(pin.id);
            }
          }
          // This gesture already pushed its undo entry when the grip was taken.
          commit({ cards: nextCards, strings: nextStrings }, { undo: false });
          setSelectedStringId(id);
        } else {
          const line: BoardString = {
            id: newStringId(),
            from: drawing.anchor,
            to: end,
            label: '',
            colour: 'red',
          };
          commit({ cards: nextCards, strings: [...strings, line] });
          // Select it, so the inspector is right there to label and colour it.
          setSelectedStringId(line.id);
        }
      }
      setDrawing(null);
      return;
    }

    if (marquee) {
      const minX = Math.min(marquee.x0, marquee.x1);
      const maxX = Math.max(marquee.x0, marquee.x1);
      const minY = Math.min(marquee.y0, marquee.y1);
      const maxY = Math.max(marquee.y0, marquee.y1);
      const hit = cards
        .filter((card) => {
          const size = cardSize(card);
          return (
            card.x + size.width > minX &&
            card.x < maxX &&
            card.y + size.height > minY &&
            card.y < maxY
          );
        })
        .map((card) => card.id);
      setSelected(new Set(hit));
      setMarquee(null);
    }
  }

  /* ----------------------------------------------------------------- zoom */

  const zoomAround = useCallback(
    (factor: number, px?: number, py?: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      const atX = px ?? rect.width / 2;
      const atY = py ?? rect.height / 2;
      setViewport((current) => {
        const nextZoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        return {
          zoom: nextZoom,
          x: atX - ((atX - current.x) / current.zoom) * nextZoom,
          y: atY - ((atY - current.y) / current.zoom) * nextZoom,
        };
      });
      if (!readOnly) sync.markDirty();
    },
    [sync],
  );

  function onWheel(event: React.WheelEvent) {
    // While cropping, the wheel zooms the picture rather than the board.
    if (croppingId) {
      const card = cardById.get(croppingId);
      if (!card) return;
      const crop = card.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
      const nextZoom = clamp(crop.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), 1, 4);
      patchCard(croppingId, {
        crop: { ...crop, zoom: Number(nextZoom.toFixed(3)) },
      });
      return;
    }
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAround(
      event.deltaY < 0 ? 1.1 : 1 / 1.1,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) {
      pinch.current = { distance, zoom: croppingId ? 1 : viewport.zoom };
      return;
    }
    const ratio = distance / pinch.current.distance;

    if (croppingId) {
      const card = cardById.get(croppingId);
      if (!card) return;
      const crop = card.crop ?? { x: 0.5, y: 0.5, zoom: 1 };
      setCards((current) =>
        current.map((item) =>
          item.id === croppingId
            ? {
                ...item,
                crop: { ...crop, zoom: clamp(crop.zoom * ratio, 1, 4) },
              }
            : item,
        ),
      );
      pinch.current = { distance, zoom: 1 };
      sync.touch();
      return;
    }

    const nextZoom = clamp(pinch.current.zoom * ratio, MIN_ZOOM, MAX_ZOOM);
    setViewport((current) => ({ ...current, zoom: nextZoom }));
  }

  function fitAll() {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || !cards.length) return;
    const bounds = boardBounds(cards);
    const zoom = clamp(
      Math.min((rect.width - 80) / bounds.width, (rect.height - 80) / bounds.height),
      MIN_ZOOM,
      1.2,
    );
    setViewport({
      zoom,
      x: rect.width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: rect.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    });
    if (!readOnly) sync.markDirty();
  }

  /* ---------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (event.key === 'Escape') {
        if (lightbox) setLightbox(null);
        else if (croppingId) setCroppingId(null);
        else if (drawing) setDrawing(null);
        else if (!typing) {
          setSelected(new Set());
          setSelectedStringId(null);
        }
        return;
      }
      if (typing) return;

      if (readOnly) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedStringId) {
          event.preventDefault();
          removeString(selectedStringId);
        } else if (selected.size) {
          event.preventDefault();
          removeCards([...selected]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, selectedStringId, croppingId, drawing, lightbox, removeCards, removeString, undo, readOnly]);

  /** If the pointer leaves the board mid-drag, finish rather than stick. */
  useEffect(() => {
    const finish = () => {
      if (drag.current) {
        drag.current = null;
        if (!readOnly) sync.markDirty();
      }
      if (cropDrag.current) {
        cropDrag.current = null;
        if (!readOnly) sync.markDirty();
      }
      if (pan.current) {
        pan.current = null;
        if (!readOnly) sync.markDirty();
      }
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [sync]);

  /* ------------------------------------------------------------- search */

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
   * Puts an entry on the wall. `at` is a board point when the card was dragged
   * from the tray and dropped somewhere specific; without it the card lands in
   * the middle of the view, as the search box has always done.
   */
  const placeEntry = useCallback(
    (
      entry: {
        id: string;
        slug?: string;
        name: string;
        coverAssetId?: string | null;
        coverCrop?: unknown;
        typeIcon?: string;
        typeColour?: string;
        typeBorder?: string;
      },
      at?: { x: number; y: number },
    ) => {
      if (entry.slug) {
        setEntries((current) => ({
          ...current,
          [entry.id]: {
            id: entry.id,
            slug: entry.slug!,
            name: entry.name,
            coverAssetId: entry.coverAssetId ?? null,
            coverCrop: entry.coverCrop ?? null,
            typeIcon: entry.typeIcon ?? 'file',
            typeColour: entry.typeColour ?? 'var(--ink-muted)',
            typeBorder: entry.typeBorder ?? 'solid',
            missing: false,
          },
        }));
      }
      addCard({
        id: newCardId(),
        kind: 'entry',
        entryId: entry.id,
        name: entry.name,
        text: '',
        ...(at
          ? { x: Math.round(at.x - CARD_WIDTH / 2), y: Math.round(at.y - CARD_SIZE.height / 2) }
          : {}),
      });
    },
    [addCard],
  );

  /** Everything in the case that is not already a card on this wall. */
  const trayEntries = useMemo(() => {
    const onWall = new Set(
      cards.filter((card) => card.kind === 'entry' && card.entryId).map((card) => card.entryId),
    );
    return caseEntries.filter((entry) => !onWall.has(entry.id));
  }, [caseEntries, cards]);

  async function addEntryCard(entryId: string, entryName: string) {
    const response = await fetch(`/api/preview?id=${encodeURIComponent(entryId)}`);
    if (response.ok) {
      const data = await response.json();
      if (data.entry) {
        setEntries((current) => ({
          ...current,
          [entryId]: {
            id: data.entry.id,
            slug: data.entry.slug,
            name: data.entry.name,
            coverAssetId: data.entry.coverAssetId,
            coverCrop: data.entry.coverCrop ?? null,
            typeIcon: data.entry.typeIcon,
            typeColour: data.entry.typeColour,
            typeBorder: data.entry.typeBorder ?? 'solid',
            missing: false,
          },
        }));
      }
    }
    addCard({
      id: newCardId(),
      kind: 'entry',
      entryId,
      name: entryName,
      text: '',
    });
    setSearch('');
    setSuggestions([]);
    offerToFile(entryId, entryName);
  }

  /* ------------------------------------------------------------- render */

  const world = {
    transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    transformOrigin: '0 0',
  } as const;

  const drawingAnchor = drawing ? pointOf(drawing.anchor) : null;
  const singleSelected = selectedCards.length === 1 ? selectedCards[0] : null;
  const selectedEntry = singleSelected?.entryId ? entries[singleSelected.entryId] : undefined;
  const selectedImage = singleSelected ? cardImage(singleSelected, selectedEntry) : null;

  /** Every loose end on the board, so a string never stops in mid-air. */
  const anchors = useMemo(() => {
    const out: { key: string; x: number; y: number }[] = [];
    for (const line of strings) {
      for (const end of [line.from, line.to] as const) {
        if (isCardEnd(end)) continue;
        out.push({ key: `${line.id}-${end.x}-${end.y}`, x: end.x, y: end.y });
      }
    }
    return out;
  }, [strings]);

  return (
    <div className="board-page">
      <div className="board-bar">
        <label className="visually-hidden" htmlFor="board-name">
          Naam van het prikbord
        </label>
        <input
          id="board-name"
          className="board-name-input"
          value={name}
          readOnly={readOnly}
          onChange={(event) => setName(event.target.value)}
          onBlur={() =>
            !readOnly &&
            void fetch(`/api/boards/${boardId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name, clientId }),
            })
          }
        />
        {readOnly && (
          <span className="chip" title="Je kunt dit prikbord bekijken, niet bewerken.">
            <Icon name="lock" size={12} />
            Alleen kijken
          </span>
        )}
        {(access.canManage || access.settings.locked) && (
          <button
            type="button"
            className="chip chip-selectable"
            onClick={() => setAccessOpen(true)}
            title="Wie mag dit prikbord zien en bewerken"
          >
            <Icon name={access.settings.viewMode === 'all' ? 'eye' : 'lock'} size={12} />
            Rechten
          </button>
        )}
        {caseSlug && (
          <Link className="chip" href={`/c/${caseSlug}`}>
            <Icon name="folder" size={12} />
            {caseName}
          </Link>
        )}
        <div className="spacer" />

        {live.others.length > 0 && (
          <span
            className="board-people"
            aria-label={`Ook op dit ${ui.words.board}: ${live.others.map((p) => p.name).join(', ')}`}
          >
            {live.others.slice(0, 5).map((person) => (
              <span
                key={person.clientId}
                className="board-person"
                style={{ background: person.colour }}
                title={person.name}
              >
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
            {live.others.length > 5 && (
              <span className="board-person board-person-more">+{live.others.length - 5}</span>
            )}
          </span>
        )}

        <span className="save-state">{syncLabel(sync.state)}</span>

        <span className="board-zoom" role="group" aria-label="Zoomen">
          <button type="button" onClick={() => zoomAround(1 / 1.25)} aria-label="Uitzoomen">
            &minus;
          </button>
          <span className="board-zoom-level">{Math.round(viewport.zoom * 100)}%</span>
          <button type="button" onClick={() => zoomAround(1.25)} aria-label="Inzoomen">
            +
          </button>
        </span>

        <button type="button" className="btn btn-small" onClick={fitAll}>
          Alles in beeld
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={undo}
          title="Ongedaan maken (Ctrl+Z)"
        >
          Ongedaan maken
        </button>
      </div>

      {!readOnly && (
      <div className="board-tools">
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
          <label className="visually-hidden" htmlFor="board-search">
            Kaart toevoegen
          </label>
          <input
            id="board-search"
            className="input"
            value={search}
            placeholder={`Zoek een ${ui.words.entry}, of typ een naam voor een ${ui.words.note}…`}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim() && (
            <ul
              className="suggest-list"
              style={{ position: 'absolute', zIndex: 30, left: 0, right: 0 }}
            >
              {suggestions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="suggest-item"
                    onClick={() => void addEntryCard(item.id, item.name)}
                  >
                    <Icon name={item.typeIcon} size={16} style={{ color: item.typeColour }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{item.name}</strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        {item.typeLabel}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="suggest-item"
                  onClick={() => {
                    addCard({
                      id: newCardId(),
                      kind: 'note',
                      name: search.trim(),
                      text: '',
                    });
                    setSearch('');
                    setSuggestions([]);
                  }}
                >
                  <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
                  <span>
                    &lsquo;<strong>{search.trim()}</strong>&rsquo; als notitie toevoegen
                  </span>
                </button>
              </li>
            </ul>
          )}
        </div>

        <button
          type="button"
          className="btn btn-small"
          onClick={() => addCard({ id: newCardId(), kind: 'note', name: 'Notitie', text: '' })}
        >
          <Icon name="plus" size={15} />
          Nieuwe notitie
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => askForPhoto('new')}
          disabled={uploading}
        >
          <Icon name="camera" size={15} />
          {uploading ? 'Uploaden…' : 'Foto'}
        </button>
        <button
          type="button"
          className="btn btn-small"
          title={`Een losse ${ui.words.pin}: een plek op de muur voor een spoor dat nog geen ${ui.words.card} heeft`}
          onClick={() => {
            const placed = addCard({ id: newCardId(), kind: 'pin', name: '', text: '' });
            setSelected(new Set([placed.id]));
            setSelectedStringId(null);
          }}
        >
          <span className="board-pin board-pin-inline" aria-hidden="true" />
          {capitalise(ui.words.pin)}
        </button>
      </div>
      )}

      {isPhone && !readOnly && <p className="board-hint">Verschuiven werkt het best op een tablet of computer.</p>}

      <div
        className="board-viewport"
        ref={viewportRef}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => live.reportPointer({ cursor: null })}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={() => {
          pinch.current = null;
          if (!readOnly) sync.markDirty();
        }}
        onDragOver={(event) => {
          // Only say yes to a card from our own tray; a file dropped here is
          // not something the cork knows what to do with.
          if (!dragging.current) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          const entry = dragging.current;
          dragging.current = null;
          if (!entry) return;
          event.preventDefault();
          const point = toBoard(event.clientX, event.clientY);
          placeEntry(entry, point);
        }}
      >
        <div className="board-world" style={world}>
          <svg
            className="board-strings"
            width={STRING_LAYER}
            height={STRING_LAYER}
            viewBox={`${-STRING_LAYER / 2} ${-STRING_LAYER / 2} ${STRING_LAYER} ${STRING_LAYER}`}
            aria-hidden="true"
          >
            {strings.map((line) => {
              const a = pointOf(line.from);
              const b = pointOf(line.to);
              if (!a || !b) return null;
              const d = stringPath(a.x, a.y, b.x, b.y);
              const colour = stringColourValue(line.colour);
              const isSelected = line.id === selectedStringId;
              return (
                <g key={line.id}>
                  {/* A wide invisible path, because 2 px of string is not a target. */}
                  <path
                    className="board-string-hit"
                    d={d}
                    onPointerDown={(event) => onStringPointerDown(event, line.id)}
                  />
                  <path
                    className={`board-string${isSelected ? ' board-string-selected' : ''}`}
                    d={d}
                    stroke={colour}
                  />
                </g>
              );
            })}

            {drawing && drawingAnchor && (
              <path
                className="board-string board-string-drawing"
                d={stringPath(drawingAnchor.x, drawingAnchor.y, drawing.x, drawing.y)}
                stroke={stringColourValue('red')}
              />
            )}
          </svg>

          {/* A pin for every loose end, so string never stops at nothing. */}
          {anchors.map((anchor) => (
            <span
              key={anchor.key}
              className="board-anchor"
              style={{ left: anchor.x, top: anchor.y }}
              aria-hidden="true"
            />
          ))}

          {/*
            §8, live: whose hand is on what. The same idea as the coloured
            border Google Sheets draws round a cell someone else has selected —
            drawn as its own layer in board coordinates rather than pushed into
            `BoardCardView`, so a card's own markup and its own selected state
            stay exactly what they were.
          */}
          {shownCards.map((card) => {
            const holder = live.heldByOthers.get(card.id);
            if (!holder) return null;
            const size = cardSize(card);
            return (
              <div
                key={`held-${card.id}`}
                className={`board-held${live.carried.has(card.id) ? ' board-card-carried' : ''}`}
                aria-hidden="true"
                style={{
                  left: card.x,
                  top: card.y,
                  width: size.width,
                  height: size.height,
                  transform: `rotate(${card.rotation}deg)`,
                  ['--held-colour' as string]: holder.colour,
                }}
              >
                <span className="board-held-name">{holder.name}</span>
              </div>
            );
          })}

          {shownCards.map((card) => (
            <BoardCardView
              key={card.id}
              card={card}
              carried={live.carried.has(card.id) && !selected.has(card.id)}
              entry={card.entryId ? entries[card.entryId] : undefined}
              selected={selected.has(card.id)}
              interactive={interactive}
              cropping={croppingId === card.id}
              canOpenOnTap={() => !interactive && pressWasSelected.current === card.id}
              onPointerDown={(event) => onCardPointerDown(event, card.id)}
              onPinPointerDown={(event) => onPinPointerDown(event, card.id)}
              onTextChange={(text) => !readOnly && patchCard(card.id, { text })}
              onOpen={() => {
                if (dragMoved.current) return;
                const entry = card.entryId ? entries[card.entryId] : undefined;
                if (entry) router.push(`/e/${entry.slug}`);
              }}
              onViewFull={() => {
                if (dragMoved.current) return;
                if (card.assetId) setLightbox({ assetId: card.assetId, name: card.name });
              }}
              onConvertToEntry={() =>
                ui.openNewEntry({
                  name: card.name,
                  shortDescription: card.text,
                  onCreated: (created) => {
                    setEntries((current) => ({
                      ...current,
                      [created.id]: {
                        id: created.id,
                        slug: created.slug,
                        name: created.name,
                        coverAssetId: null,
                        coverCrop: null,
                        typeIcon: created.typeIcon,
                        typeColour: created.typeColour,
                        typeBorder: 'solid',
                        missing: false,
                      },
                    }));
                    // §8: the note becomes an entry card in place.
                    patchCard(card.id, {
                      kind: 'entry',
                      entryId: created.id,
                      name: created.name,
                    });
                    offerToFile(created.id, created.name);
                  },
                })
              }
            />
          ))}

          {/*
            Labels are HTML on top of the cards, not SVG underneath them: the
            string itself belongs behind a card, but its label has to stay
            readable when two cards sit shoulder to shoulder — and a chip you
            can actually tap beats 11px of text with a stroke around it.
          */}
          {strings.map((line) => {
            if (!line.label) return null;
            const a = pointOf(line.from);
            const b = pointOf(line.to);
            if (!a || !b) return null;
            return (
              <button
                key={`label-${line.id}`}
                type="button"
                className={`board-string-label${line.id === selectedStringId ? ' board-string-label-on' : ''}`}
                style={{
                  left: (a.x + b.x) / 2,
                  top: (a.y + b.y) / 2 + sagOf(a.x, a.y, b.x, b.y) + 4,
                  borderColor: stringColourValue(line.colour),
                }}
                onPointerDown={(event) => onStringPointerDown(event, line.id)}
              >
                {line.label}
              </button>
            );
          })}

          {/*
            The two grips on the selected string. Grab one and drop it on
            another card, or on bare cork, to move that end — the same gesture
            as running a new string, so there is nothing extra to learn.
          */}
          {interactive &&
            selectedString &&
            (['from', 'to'] as const).map((which) => {
              const at = pointOf(selectedString[which]);
              if (!at) return null;
              return (
                <button
                  key={`handle-${selectedString.id}-${which}`}
                  type="button"
                  className="board-end-handle"
                  aria-label={`Verplaats het ${which === 'from' ? 'eerste' : 'tweede'} uiteinde van deze draad`}
                  style={{ left: at.x, top: at.y }}
                  onPointerDown={(event) => onEndHandlePointerDown(event, selectedString, which)}
                />
              );
            })}

          {marquee && (
            <div
              className="board-marquee"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}

          {/*
            §8, live: everyone else's hand. Drawn in board coordinates so each
            viewer sees it under their own pan and zoom, counter-scaled so an
            arrow is an arrow at every zoom, and eased between frames so
            sixteen frames a second read as one movement.
          */}
          {live.pointers.map((pointer) => (
            <div
              key={pointer.clientId}
              className="board-cursor"
              aria-hidden="true"
              style={{
                left: pointer.x,
                top: pointer.y,
                transform: `scale(${1 / viewport.zoom})`,
                ['--cursor-colour' as string]: pointer.colour,
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" className="board-cursor-arrow">
                <path d="M4 3l7.5 17 2.3-7.2L21 10.5z" />
              </svg>
              <span className="board-cursor-name">{pointer.name}</span>
            </div>
          ))}
        </div>

        {!cards.length && (
          <div className="board-empty">
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--serif)',
                fontSize: '1.1rem',
              }}
            >
              Nog niets geprikt.
            </p>
            <p className="small" style={{ margin: '0.3rem 0 0' }}>
              Zoek hierboven om een {ui.words.entry} te prikken, begin een {ui.words.note}, of druk een losse {ui.words.pin}
              in de muur voor een spoor dat nog geen kaart heeft. Sleep vanaf de kop van een
              {ui.words.pin} om {ui.words.string} te spannen &mdash; naar een andere {ui.words.card}, of naar het kale kurk,
              waar vanzelf een nieuwe {ui.words.pin} in gaat.
            </p>
          </div>
        )}

        {caseId && !readOnly && (
          <BoardTray
            entries={trayEntries}
            onAdd={(entry) => placeEntry(entry)}
            onDragStart={(entry, event) => {
              dragging.current = entry;
              event.dataTransfer.effectAllowed = 'copy';
              // Firefox will not start a drag without payload on the transfer.
              event.dataTransfer.setData('text/plain', entry.name);
            }}
          />
        )}

        {!readOnly && (
        <BoardInspector
          cards={selectedCards}
          string={selectedString}
          cropping={Boolean(croppingId)}
          busy={uploading}
          canCrop={Boolean(singleSelected?.showImage && selectedImage?.assetId)}
          hasOwnPhoto={Boolean(singleSelected?.assetId)}
          inheritedBorderLabel={
            selectedEntry?.typeBorder ? borderLabel(selectedEntry.typeBorder) : null
          }
          borderValue={
            singleSelected
              ? (singleSelected.border ??
                (selectedEntry ? '' : cardBorder(singleSelected, selectedEntry)))
              : ''
          }
          canOpenEntry={Boolean(selectedEntry)}
          onLabelChange={(label) => selectedString && patchString(selectedString.id, { label })}
          onColourChange={(colour: StringColour) =>
            selectedString && patchString(selectedString.id, { colour })
          }
          onRemoveString={() => selectedString && removeString(selectedString.id)}
          onCrop={() => singleSelected && setCroppingId(singleSelected.id)}
          onDoneCropping={() => setCroppingId(null)}
          onAddPhoto={() => singleSelected && askForPhoto(singleSelected.id)}
          onRemovePhoto={() =>
            singleSelected && patchCard(singleSelected.id, { assetId: null, crop: null })
          }
          onToggleImage={() =>
            singleSelected &&
            patchCard(singleSelected.id, {
              showImage: !singleSelected.showImage,
            })
          }
          onBorderChange={(border) => singleSelected && patchCard(singleSelected.id, { border })}
          onRename={(name) => singleSelected && patchCard(singleSelected.id, { name })}
          onOpenEntry={() => selectedEntry && router.push(`/e/${selectedEntry.slug}`)}
          onRemoveCards={() => removeCards(selectedCards.map((card) => card.id))}
          onClose={() => {
            setSelected(new Set());
            setSelectedStringId(null);
            setCroppingId(null);
          }}
        />
        )}
      </div>

      {accessOpen && (
        <Sheet onClose={() => setAccessOpen(false)} labelledBy="board-access-title">
          <div className="row" style={{ marginBottom: '0.8rem' }}>
            <h2 id="board-access-title" style={{ margin: 0, fontSize: '1.3rem' }}>
              Wie mag hier aan
            </h2>
            <div className="spacer" />
            <button
              className="btn btn-ghost btn-small"
              type="button"
              onClick={() => setAccessOpen(false)}
              aria-label="Sluiten"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <AccessEditor
            target="board"
            id={boardId}
            initial={access.settings}
            canManage={access.canManage}
            isKeeper={access.isKeeper}
            viewerId={access.viewerId}
            nouns={{ this: `dit ${ui.words.board}` }}
          />
        </Sheet>
      )}

      {lightbox && (
        <div
          className="board-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name || 'Foto'}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(lightbox.assetId, 'full')} alt={lightbox.name || ''} />
          <button type="button" className="btn btn-small" aria-label="Sluiten">
            <Icon name="close" size={16} />
            Sluiten
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadPhoto(file);
        }}
      />
    </div>
  );
}
