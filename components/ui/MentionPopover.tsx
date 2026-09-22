'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useMentionFiling } from '@/components/cases/useMentionFiling';
import { closePopover, openPopover } from '@/lib/popoverStack';
import {
  currentView,
  dropDanglingOpeners,
  placeSuggestList,
  previewSegments,
  previewWorth,
  type ListPlace,
} from '@/lib/editor/shortBox';
import { useUi } from './UiProvider';
import { useShortChips } from './ShortChips';
import { hasTokens, splitShort } from '@/lib/entries/shortTokens.mjs';

/**
 * §27, round 18: `@` in a plain text box.
 *
 * The archive's plain boxes — the writing on a kaart, the text under a
 * gebeurtenis, a notitie-speld — have understood `@Naam` and `[[Naam]]` since
 * round 6 (`entryIdsInText`), but nothing ever *offered* a name, so nobody
 * knew, and a name typed from memory with one letter off matched nothing.
 * This is the offer: type `@` or `[[` and a list of artikelen appears under
 * the box; arrows, Enter or a tap put `[[Naam]]` in the text — the exact
 * form, so a name with a space in it, or a name inside another name, is read
 * back as one whole.
 *
 * It attaches to a textarea it does not own. That matters because two of the
 * three boxes are `LiveField`s bound to a Yjs room, which own their own
 * onChange and diff the DOM value against the shared text. So the popover
 * never renders a textarea and never calls onChange: it writes into the
 * element through the native value setter and fires an `input` event, which
 * is exactly what a keystroke does — React's onChange fires, the room diffs,
 * and the caret is put after the name. One road for both kinds of box.
 */

type Suggestion = { id: string; name: string; typeIcon?: string; typeColour?: string; typeLabel?: string; originCaseName?: string | null };

/** The trigger before the caret: `@jan` or `[[jan`, and where it starts. */
function triggerBefore(value: string, caret: number): { start: number; query: string } | null {
  const head = value.slice(0, caret);
  /*
   * §69: `]` hoort ook bij de grens.
   *
   * Een `@` mag beginnen aan het begin van de tekst, na witruimte of na een
   * haakje — en sinds deze ronde ook **direct na een andere vermelding**:
   * `[[Jan]]@Piet` is precies wat je typt als je twee namen achter elkaar zet
   * zonder spatie ertussen, en dat leverde helemaal geen lijst op. Het is geen
   * nieuwe wens maar een oud gat; het viel deze ronde op omdat §69 (4.5) een
   * half getypte beschrijving bewaart, zodat een vak vaker al met `]]` eindigt
   * op het moment dat er een naam achter komt.
   */
  const m = /(^|[\s(“"'\]])(@|\[\[)([^\n@[\]]{0,60})$/.exec(head);
  if (!m) return null;
  const start = caret - m[2].length - m[3].length;
  return { start, query: m[3] };
}

/**
 * §48: a box is a `<textarea>` or an `<input>`. The one-line boxes — a
 * dossier's samenvatting, an artikel's korte beschrijving in the sheet that
 * makes it — are inputs, and they are exactly where somebody reaches for a
 * name. Everything below works on both; only the prototype whose value setter
 * is borrowed differs.
 */
export type MentionBox = HTMLTextAreaElement | HTMLInputElement;

/** Puts `text` in place of [from, to) and fires the event the box's owner listens to. */
function replaceRange(el: MentionBox, from: number, to: number, text: string, caretAt?: number) {
  const next = el.value.slice(0, from) + text + el.value.slice(to);
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  const caret = caretAt ?? from + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function MentionPopover({
  forRef,
  element,
  disabled,
}: {
  /** The box, through a ref that does not change (a plain box a component owns). */
  forRef?: RefObject<MentionBox | null>;
  /** Or the box as state — for a box that is swapped under the ref, like a `LiveField` when its room arrives. */
  element?: MentionBox | null;
  disabled?: boolean;
}) {
  const target = element ?? forRef?.current ?? null;
  const [open, setOpen] = useState<{ start: number; query: string; rect: { left: number; top: number; bottom: number; width: number } } | null>(null);
  /*
   * §92: waar de lijst hangt, apart van `open` — hij wordt opnieuw uitgerekend
   * als het toetsenbord opkomt (`visualViewport`), en dat is geen nieuwe
   * vraag aan het archief.
   */
  const [place, setPlace] = useState<ListPlace | null>(null);
  /*
   * §92 (A4): "'Jan' aanmaken" opent een blad, en het vak verliest zijn focus
   * terwijl `[[Jan` nog op het antwoord wacht. Dat is geen verlaten vak; de
   * losse haakjes blijven staan tot het blad de naam terugschrijft.
   */
  const creating = useRef(false);
  /*
   * §92: an `@` the hand said no to (Escape). The list was closed on the key
   * and opened again on its `keyup`, because the `@Jan` was still before the
   * caret — so Escape never really closed it. Remembered by where it starts;
   * a new trigger somewhere else opens as always.
   */
  const dismissed = useRef<number | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeRef = useRef(active);
  activeRef.current = active;

  /*
   * §69: while the list is up it stands on the popover pile, so a `Sheet` round
   * it lets Escape through to the list first — its own handler is in the
   * capture phase on `document` and is upstream of the capture listener this
   * component puts on the box. One press closes the list, the next closes the
   * sheet. `lib/popoverStack.ts` is the whole of it.
   */
  useEffect(() => {
    if (!open) return;
    const token = openPopover();
    return () => closePopover(token);
  }, [open]);

  /*
   * §48: the row the rich editor has had since §6 — "'Jan' aanmaken" — in the
   * plain boxes too. A name that is not in the archive yet is the commonest
   * reason to be typing `@` at all, and until round 25 the only answer here was
   * to leave the box, make the artikel and come back.
   *
   * Two things ride along, both from `useUi()` and both null outside a dossier:
   * the sheet is opened *in* the dossier this screen is (§24: that is the only
   * way a voorwerp or an aanwijzing can be made), and whatever lands in the
   * text — made or picked — is offered a place on its shelves (§48).
   */
  const ui = useUi();
  const offerFiling = useMentionFiling();
  const here = ui.caseHere;
  // Read from the element's own handlers, which outlive this render.
  const createRef = useRef<(name: string) => void>(() => {});
  const linkedRef = useRef(offerFiling);
  linkedRef.current = offerFiling;

  useEffect(() => {
    const el = target;
    if (!el || disabled) return;

    const look = () => {
      const caret = el.selectionStart ?? el.value.length;
      const hit = triggerBefore(el.value, caret);
      if (!hit || hit.start === dismissed.current) {
        if (!hit) dismissed.current = null;
        if (openRef.current) setOpen(null);
        return;
      }
      dismissed.current = null;
      const r = el.getBoundingClientRect();
      /*
       * §69 (5.4): dezelfde staat is geen nieuwe staat.
       *
       * `look` draaide alleen op een toets of een klik, dus een nieuw object
       * teruggeven kostte niets. Sinds het ook op scrollen en resizen draait
       * wél: het ophaal-effect hieronder hangt aan `open` zelf, dus elk nieuw
       * object leegde de lijst en begon de fetch opnieuw — en een pagina die
       * onder een suggestielijst scrollt (een blad dat openschuift, een veld dat
       * in beeld gebracht wordt) vuurt tientallen keren. De lijst kwam dan
       * nooit tot stand. (Gevonden door `round-27-web` in de volle suite, en
       * daarna door niets kleiners.)
       */
      setOpen((current) =>
        current &&
        current.start === hit.start &&
        current.query === hit.query &&
        current.rect.left === r.left &&
        current.rect.top === r.top &&
        current.rect.bottom === r.bottom &&
        current.rect.width === r.width
          ? current
          : { start: hit.start, query: hit.query, rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width } },
      );
    };
    const close = () => setOpen(null);
    const pick = (item: Suggestion) => {
      const state = openRef.current;
      if (!state) return;
      const caret = el.selectionStart ?? el.value.length;
      replaceRange(el, state.start, caret, `[[${item.name}]] `);
      setOpen(null);
      el.focus();
      // §48: named in a dossier's own writing — should it be in the dossier?
      linkedRef.current({ id: item.id, name: item.name });
    };
    // A union of two element types makes `addEventListener`'s overloads
    // ambiguous, so the listener takes the base `Event` and narrows itself.
    const onKey = (plain: Event) => {
      const event = plain as KeyboardEvent;
      if (!openRef.current) return;
      const list = itemsRef.current;
      // §48: the create row is the last one, and it is there whenever
      // something has been typed — even before any suggestion has arrived.
      const canCreate = Boolean(openRef.current.query.trim());
      const total = list.length + (canCreate ? 1 : 0);
      if (!total) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const state = openRef.current!;
        close();
        /*
         * §92 (A4): Escape says "this is not a name". For `[[` that means the
         * brackets go — the same answer the rich editor now gives, and the one
         * leaving the box gives — and the letters stay where the caret is.
         * An `@` stays (it is also just a character) and is left alone until
         * the hand starts another one.
         */
        if (el.value.slice(state.start, state.start + 2) === '[[') {
          const caret = el.selectionStart ?? el.value.length;
          replaceRange(el, state.start, state.start + 2, '', Math.max(state.start, caret - 2));
        } else {
          dismissed.current = state.start;
        }
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((activeRef.current + 1) % total);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((activeRef.current - 1 + total) % total);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        const index = Math.min(activeRef.current, total - 1);
        if (index < list.length) pick(list[index]);
        else createRef.current(openRef.current.query.trim());
      }
    };
    const onBlur = () => {
      // After the click on an item has had its chance (it uses mousedown).
      setTimeout(close, 120);
      /*
       * §92 (A4): een `[[` zonder `]]` is geen vermelding. Wie het vak verlaat
       * met `[[Jac` erin, bedoelde `Jac` — of had nog niet gekozen — en wat er
       * stond ging tot deze ronde letterlijk het archief in en stond daarna
       * met haakjes op de leespagina. Nu gaan de haakjes eraf, op dezelfde weg
       * als een keuze uit de lijst (de native setter plus een `input`), dus de
       * kamer en de autosave horen het als een toets.
       *
       * Synchroon, in `blur`: dat komt vóór React's `onBlur` (die luistert op
       * `focusout`), zodat een vak dat bij het verlaten bewaart de schone tekst
       * bewaart. Niet als het venster zelf de focus verliest (een andere app,
       * een ander tabblad): wie terugkomt, typt verder waar hij was.
       */
      if (creating.current) return;
      if (typeof document !== 'undefined' && !document.hasFocus()) return;
      if (el.readOnly || el.disabled) return;
      const cleaned = dropDanglingOpeners(el.value);
      if (cleaned === el.value) return;
      replaceRange(el, 0, el.value.length, cleaned);
    };
    const onFocus = () => {
      creating.current = false;
    };
    /*
     * §69 (5.4): hermeten als er iets schuift.
     *
     * The list is `position: fixed` at the box's rect, and that rect was read
     * once, when the `@` was typed. Anything that moved the box afterwards —
     * a sheet scrolling under a long form, the page scrolling behind it, a
     * window resize, a canvas panning under a floating field — left the list
     * hanging where the box *used to be*, sometimes halfway up the screen. The
     * `MentionOverlay` further down this file has had exactly this treatment
     * since §56; this is the list catching up with its own mirror.
     *
     * Only while a list is open, and only a re-measure: `look` re-reads the
     * caret too, which is right — if the thing under the caret is no longer an
     * `@`-run, the list should not be standing there at all.
     */
    const remeasure = () => {
      if (openRef.current) look();
    };
    el.addEventListener('input', look);
    el.addEventListener('click', look);
    el.addEventListener('keyup', look);
    el.addEventListener('keydown', onKey, true);
    el.addEventListener('blur', onBlur);
    el.addEventListener('focus', onFocus);
    // Capture, so a scroll inside any ancestor (a sheet, a panel) is heard —
    // scroll does not bubble.
    window.addEventListener('scroll', remeasure, true);
    window.addEventListener('resize', remeasure);
    // §92 (A5): het toetsenbord van een telefoon verkleint het zichtbare deel
    // zonder dat het venster een `resize` krijgt.
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    vv?.addEventListener('resize', remeasure);
    vv?.addEventListener('scroll', remeasure);
    (el as MentionBox & { __mentionPick?: (item: Suggestion) => void }).__mentionPick = pick;
    return () => {
      el.removeEventListener('input', look);
      el.removeEventListener('click', look);
      el.removeEventListener('keyup', look);
      el.removeEventListener('keydown', onKey, true);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('focus', onFocus);
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
      vv?.removeEventListener('resize', remeasure);
      vv?.removeEventListener('scroll', remeasure);
    };
  }, [target, disabled]);

  /*
   * §92 (A5): de lijst hangt bij het vak en klapt om als er onder te weinig
   * ruimte is — `placeSuggestList`, hetzelfde algoritme als de lijst in de
   * lopende tekst (`SuggestionPopup`). Gemeten tegen het zichtbare deel van
   * het scherm: op een telefoon met open toetsenbord hing de lijst tot deze
   * ronde voor het grootste deel onder dat toetsenbord.
   */
  useEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const next = placeSuggestList(open.rect, currentView());
    setPlace((current) =>
      current &&
      current.left === next.left &&
      current.width === next.width &&
      current.top === next.top &&
      current.bottom === next.bottom &&
      current.maxHeight === next.maxHeight
        ? current
        : next,
    );
  }, [open]);

  // The names, fetched a beat after the last keystroke.
  useEffect(() => {
    if (!open) {
      setItems([]);
      return;
    }
    const q = open.query.trim();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}&limit=6`)
        .then((r) => (r.ok ? r.json() : { entries: [] }))
        .then((data: { entries?: Suggestion[] }) => {
          setItems(data.entries ?? []);
          setActive(0);
        })
        .catch(() => setItems([]));
    }, q ? 120 : 0);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open?.query, open?.start, open]);

  /*
   * §48: make it, then write it into the box. The sheet is the only door
   * (§18b), so the rights check and the onderzoeker question come with it; the
   * dossier is handed in as the place it is being made.
   *
   * §49: and that now means filed there, full stop — a name typed into a
   * dossier's own writing that turns into a new artikel belongs to that
   * investigation. The sheet's tickbox asks about the *name*, not the filing;
   * the round-25 offer below (`linkedRef`) is still there for a name that was
   * already an artikel, which is the case it was written for.
   */
  const typed = open?.query.trim() ?? '';
  const start = open?.start ?? 0;
  const create = (name: string) => {
    const el = target;
    if (!el || !name) return;
    setOpen(null);
    creating.current = true;
    ui.openNewEntry({
      name,
      caseId: here?.id,
      onCreated: (entry) => {
        creating.current = false;
        const caret = Math.max(start, Math.min(el.value.length, el.selectionStart ?? el.value.length));
        replaceRange(el, start, caret, `[[${entry.name}]] `);
        el.focus();
        linkedRef.current({ id: entry.id, name: entry.name }, entry.filed);
      },
    });
  };
  createRef.current = create;

  if (!open || !place || (!items.length && !typed)) return null;
  const pick = (item: Suggestion) => (target as (MentionBox & { __mentionPick?: (item: Suggestion) => void }) | null)?.__mentionPick?.(item);
  // In a portal: a `position: fixed` box inside a transformed ancestor (a
  // prikbord's canvas, a sheet sliding in) is fixed to that ancestor, not to
  // the screen, and lands under whatever is drawn over it.
  return createPortal(
    <ul
      className={`suggest-list mention-pop${place.up ? ' mention-pop-up' : ''}`}
      role="listbox"
      aria-label="Artikelen"
      style={{
        position: 'fixed',
        left: place.left,
        top: place.top,
        bottom: place.bottom,
        width: place.width,
        maxHeight: place.maxHeight,
        zIndex: 60,
        margin: 0,
      }}
      data-testid="mention-pop"
      data-up={place.up ? 'true' : undefined}
    >
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            className="suggest-item mention-pop-item"
            role="option"
            aria-selected={i === active}
            onPointerDown={(event) => {
              // Before the box can lose focus: the pick writes into it and
              // hands focus back at once.
              event.preventDefault();
              event.stopPropagation();
              pick(item);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
          >
            {/* §92 (A5): één regel naam, en daaronder het icoon en het woord
                van de soort — de rij is een duim hoog (`--tap`) en een lange
                naam wordt afgekapt in plaats van drie regels hoog. */}
            <Icon name={item.typeIcon || 'file'} size={16} style={{ color: item.typeColour || 'var(--ink-muted)' }} />
            <span className="mention-pop-text">
              <span className="mention-pop-name">{item.name}</span>
              {(item.typeLabel || item.originCaseName) && (
                <span className="tiny muted mention-pop-kind">{[item.typeLabel, item.originCaseName].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </button>
        </li>
      ))}
      {typed && (
        // §92 (A5): de rij "aanmaken" staat vast onderaan de lijst, ook als de
        // namen erboven scrollen — op een telefoon aan tafel is dit juist de
        // reden om `[[` te typen.
        <li className="mention-pop-create">
          <button
            type="button"
            className="suggest-item"
            role="option"
            aria-selected={active === items.length}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              create(typed);
            }}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(items.length)}
          >
            <Icon name="plus" size={16} style={{ color: 'var(--stamp-red)' }} />
            <span className="mention-pop-text">
              <span className="mention-pop-name">
                &lsquo;<strong>{typed}</strong>&rsquo; aanmaken
              </span>
            </span>
          </button>
        </li>
      )}
    </ul>,
    document.body,
  );
}
/* ------------------------------------------------------------- reading */

/**
 * Round 21: what a plain box's shorthand *is* — the same `.entry-chip` the
 * rich editor writes, with the same `data-entry-id`, so the hover preview and
 * the click both come for free from `EntryPreview` and an `<a href>`. Round 18
 * printed a flat highlight that was not a link and left `@Naam` alone, because
 * the browser had no name index. It still has none: the server reads the text
 * and answers with the spans (`POST /api/mentions`), which is also why `@Naam`
 * can be a chip now — where a name ends is the index's business, and the index
 * is the one answering.
 *
 * A name that matches nothing the reader may open is a dead chip
 * (`.entry-chip-missing`), which is what a typo gets as well: the two look the
 * same on purpose, so a dead chip never says "there is an artikel here you are
 * not allowed to see".
 */
type Span = { start: number; end: number; name: string; entryId: string | null; slug: string | null; icon: string | null; colour: string | null };

const spanCache = new Map<string, Span[]>();
const waiting = new Map<string, Set<(spans: Span[]) => void>>();
let flushQueued = false;

/**
 * One request for every text that asked in the same tick. A wall of forty
 * kaarten mounts forty of these at once and must not be forty requests.
 */
function flush() {
  flushQueued = false;
  const texts = [...waiting.keys()].slice(0, 60);
  if (!texts.length) return;
  const takers = texts.map((text) => waiting.get(text)!);
  for (const text of texts) waiting.delete(text);
  void fetch('/api/mentions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts }),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ texts: { spans: Span[] }[] }>) : null))
    .then((data) => {
      // A live room can retype a card a hundred times; the cache is a help,
      // not a ledger.
      if (spanCache.size > 500) spanCache.clear();
      texts.forEach((text, i) => {
        const spans = data?.texts?.[i]?.spans ?? [];
        spanCache.set(text, spans);
        for (const taker of takers[i]) taker(spans);
      });
    })
    .catch(() => {
      // Offline or logged out: the text stays readable, only unchipped.
      texts.forEach((text, i) => {
        spanCache.set(text, []);
        for (const taker of takers[i]) taker([]);
      });
    });
  if (waiting.size && !flushQueued) {
    flushQueued = true;
    queueMicrotask(flush);
  }
}

/**
 * The spans of one text: from the cache at once, or from one batched request.
 * `settle` is for a box being typed in — the row under a sheet's textarea asks
 * again on every keystroke otherwise, and the answer to a half-typed name is
 * worth nothing.
 */
export function useMentionSpans(text: string, settle = 0): Span[] | null {
  const [spans, setSpans] = useState<Span[] | null>(() => spanCache.get(text) ?? null);
  useEffect(() => {
    const cached = spanCache.get(text);
    if (cached) {
      setSpans(cached);
      return;
    }
    if (!text || !/\[\[|@/.test(text)) {
      setSpans([]);
      return;
    }
    setSpans(null);
    let alive = true;
    const taker = (next: Span[]) => {
      if (alive) setSpans(next);
    };
    const ask = () => {
      const set = waiting.get(text) ?? new Set<(spans: Span[]) => void>();
      set.add(taker);
      waiting.set(text, set);
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(flush);
      }
    };
    const timer = settle ? setTimeout(ask, settle) : (ask(), 0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      waiting.get(text)?.delete(taker);
    };
  }, [text, settle]);
  return spans;
}

/**
 * The chip itself, in both its states — and, since §48, in two shapes.
 *
 * `flat` draws the chip as a `<span>` instead of an `<a>`. That is for the one
 * place a link cannot go: inside another link. A card in the wiki, a row in the
 * feed and a hit in Zoeken are each one big `<a>` to the thing they describe,
 * and an `<a>` inside an `<a>` is invalid HTML — React says so in the console,
 * and `no-console-warnings.spec.ts` fails on it. The chip still *looks* like a
 * chip there, and the card it sits in is what the reader clicks.
 */
export function MentionChip({ span, flat, tabIndex }: { span: Span; flat?: boolean; tabIndex?: number }) {
  const style = span.colour ? ({ ['--chip-colour' as string]: span.colour } as React.CSSProperties) : undefined;
  if (!span.slug || !span.entryId) {
    return (
      <span className="entry-chip entry-chip-missing" title="Geen artikel met deze naam">
        {span.name}
      </span>
    );
  }
  if (flat) {
    return (
      <span className="entry-chip" data-entry-slug={span.slug} style={style}>
        {span.name}
      </span>
    );
  }
  return (
    <a
      className="entry-chip"
      href={`/e/${span.slug}`}
      data-entry-id={span.entryId}
      data-entry-slug={span.slug}
      data-entry-icon={span.icon ?? ''}
      style={style}
      tabIndex={tabIndex}
    >
      {span.name}
    </a>
  );
}

/**
 * Plain text with its shorthand shown as chips — how a kaart, a speld or a
 * gebeurtenis prints what was typed into it. Until the answer arrives the
 * brackets are already off, so the text never flashes its punctuation.
 */
export function MentionText({
  text,
  flat,
  tokens,
  plain,
}: {
  text: string;
  flat?: boolean;
  /**
   * §95: this text is one of the short boxes that write handles — a korte
   * beschrijving, a samenvatting, an infobox Tekst. Its chips are `⟦h⟧` and
   * only those: an `@Naam` in it is the letters somebody typed, and it is not
   * looked up by name (A2). A text that already holds a handle is read this
   * way whatever the caller says.
   */
  tokens?: boolean;
  /** §95: names as words, no chips — for a row that prints the text small and flat (a shop row, a picker). */
  plain?: boolean;
}) {
  if (tokens || hasTokens(text)) return <ShortTextView text={text} flat={flat} plain={plain} />;
  return <LegacyMentionText text={text} flat={flat} plain={plain} />;
}

/**
 * §95: a short text read aloud — its handles as chips, resolved per reader
 * (`useShortChips`). A handle there is nothing to draw for leaves nothing, not
 * a dead chip: a dead chip would say *something is here that you may not see*.
 * A leftover `[[typo]]` that the migration could not resolve is still drawn as
 * the dead chip it has always been, so nobody sees a text change on the day.
 */
function ShortTextView({ text, flat, plain }: { text: string; flat?: boolean; plain?: boolean }) {
  const parts = useMemo(() => splitShort(text), [text]);
  const handles = useMemo(() => parts.flatMap((part) => (part.kind === 'chip' ? [part.handle] : [])), [parts]);
  const chips = useShortChips(handles);
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.kind === 'text') {
      let at = 0;
      for (const match of part.text.matchAll(/\[\[([^\]\n]{1,120})\]\]/g)) {
        const start = match.index ?? 0;
        if (start > at) out.push(<span key={`t${i}-${at}`}>{part.text.slice(at, start)}</span>);
        const name = match[1].trim();
        out.push(
          plain ? (
            <span key={`d${i}-${start}`}>{name}</span>
          ) : (
            <MentionChip
              key={`d${i}-${start}`}
              span={{ start: 0, end: 0, name, entryId: null, slug: null, icon: null, colour: null }}
              flat={flat}
            />
          ),
        );
        at = start + match[0].length;
      }
      if (at < part.text.length) out.push(<span key={`t${i}-${at}`}>{part.text.slice(at)}</span>);
      return;
    }
    const chip = chips.get(part.handle);
    if (!chip) return;
    out.push(
      plain ? (
        <span key={`c${i}`}>{chip.name}</span>
      ) : (
        <MentionChip
          key={`c${i}`}
          span={{ start: 0, end: 0, name: chip.name, entryId: chip.entryId, slug: chip.slug, icon: chip.icon, colour: chip.colour }}
          flat={flat}
        />
      ),
    );
  });
  return <>{out}</>;
}

function LegacyMentionText({ text, flat, plain }: { text: string; flat?: boolean; plain?: boolean }) {
  const spans = useMentionSpans(text);
  if (plain) return <>{text.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, name: string) => name.trim())}</>;
  if (!spans) return <>{text.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, name: string) => name.trim())}</>;
  if (!spans.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((span, i) => {
    if (span.start > at) out.push(<span key={`t${i}`}>{text.slice(at, span.start)}</span>);
    out.push(<MentionChip key={`c${i}`} span={span} flat={flat} />);
    at = span.end;
  });
  if (at < text.length) out.push(<span key="tail">{text.slice(at)}</span>);
  return <>{out}</>;
}

/*
 * §92: `MentionRow` — de regel "Verwijst naar" onder een vak (§54) — is weg.
 * Het waren de "gekke hyperlinks onder dit vakje" uit Nicks melding. Buiten
 * focus toont het vak nu zelf zijn chips (`MentionPreview` hieronder), in
 * focus staat de ruwe tekst, en een regel eronder die hetzelfde nog eens zegt
 * duwde alles eronder omlaag terwijl je typte.
 */

/* ------------------------------------------------- §56: a chip in the box */

/**
 * §56, round 28: the chip is *inside* the box you are typing in.
 *
 * §54 put the chips on a row under the box, because a `<textarea>` holds
 * characters and an element cannot go in one. That is still true, and the row
 * is still there — but it was not the wish. The wish was to click the name
 * where it stands, in the sentence being written.
 *
 * So: a **highlight overlay**. A mirror `<div>` is laid exactly over the box,
 * with the box's own typography and box metrics copied off `getComputedStyle`,
 * printing the box's own text with every `[[Naam]]` and `@Naam` run wrapped in
 * a chip. The mirror does not take the pointer (`pointer-events: none`); only
 * the chips do, so a click on a chip navigates and a click anywhere else falls
 * straight through to the box, caret and all. The box keeps its text —
 * `color: transparent` with a `caret-color`, so the caret and the selection
 * are still the browser's — and the room, the diff and the plain string are
 * untouched. `LiveField`'s Yjs binding never learns this happened.
 *
 * **The mirror holds the same characters as the box, brackets included.** A
 * chip that dropped the `[[` and `]]` would shift every character after it and
 * the caret would no longer sit under its letter. The brackets are dimmed, not
 * removed; they occupy their space. Do not "tidy" them away.
 */
export type MentionSpan = Span;

/** A run of the box's text: plain, or one whole mention (brackets and all). */
export type MirrorSegment = { text: string; span: Span | null };

/**
 * Is the span still the run it was resolved from? The answer for a text is
 * fetched a beat after the last keystroke, so between two keys the newest
 * letters are described by the previous answer. A span whose characters are no
 * longer what it says they are is dropped rather than drawn in the wrong
 * place — the chip comes back a moment later, in the right one.
 */
function spanIntact(text: string, span: Span): boolean {
  const raw = text.slice(span.start, span.end);
  return raw === `[[${span.name}]]` || (raw.startsWith('@') && raw.slice(1) === span.name);
}

/**
 * `(text, spans)` → the mirror's runs. **Every character of `text`, in order,
 * exactly once**: that invariant is what keeps the caret under its letter, and
 * it is what `tests/unit/mention-mirror.test.ts` pins.
 */
export function mirrorSegments(text: string, spans: Span[]): MirrorSegment[] {
  const out: MirrorSegment[] = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at || span.end <= span.start || span.end > text.length) continue;
    if (!spanIntact(text, span)) continue;
    if (span.start > at) out.push({ text: text.slice(at, span.start), span: null });
    out.push({ text: text.slice(span.start, span.end), span });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), span: null });
  return out;
}

/**
 * The properties that decide where a character lands. Copied off the box every
 * time it is measured, rather than written out in CSS, because the boxes wear
 * four different classes (`.input`, `.textarea`, `.lead-input`, a board card's
 * own) and a mirror that guessed would drift the moment one of them changed.
 */
const MIRROR_STYLES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'fontStretch',
  'letterSpacing',
  'wordSpacing',
  'lineHeight',
  'textTransform',
  'textIndent',
  'textAlign',
  'direction',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'tabSize',
  'overflowWrap',
  'wordBreak',
] as const;

/** The character index in the box under a point, read off the mirror's own text nodes. */
function indexFromPoint(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  } else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text === node) return at + Math.min(offset, text.data.length);
    at += text.data.length;
  }
  return null;
}

export function MentionOverlay({
  element,
  forRef,
  value,
  disabled,
}: {
  /** The box as state — a `LiveField`, whose element is swapped when the room arrives. */
  element?: MentionBox | null;
  /** Or through a ref, for a plain box a component owns. */
  forRef?: RefObject<MentionBox | null>;
  /** The parent's copy of the text; the box's own value wins the moment it exists. */
  value: string;
  disabled?: boolean;
}) {
  const [fromRef, setFromRef] = useState<MentionBox | null>(null);
  // The ref is filled in after the first paint, and a sheet mounts its box
  // later still. Cheap, and `setState` with the same element is a no-op.
  useEffect(() => {
    if (forRef) setFromRef(forRef.current ?? null);
  });
  const box = element ?? fromRef ?? null;

  // The value the box actually holds — the room may have typed into it without
  // the parent's `value` catching up yet.
  const [typed, setTyped] = useState(value);
  useEffect(() => {
    setTyped(box ? box.value : value);
  }, [value, box]);
  useEffect(() => {
    const el = box;
    if (!el) return;
    const read = () => setTyped(el.value);
    el.addEventListener('input', read);
    return () => el.removeEventListener('input', read);
  }, [box]);
  const text = box ? typed : value;

  /*
   * §56: a box with no `@` and no `[[` in it has nothing to mirror, and there
   * are nine of them around one infobox. Asking the archive to resolve every
   * one of those on every keystroke is a request per box per stroke for an
   * answer that is always empty — measured, not guessed: it is what kept the
   * infobox's own save from landing inside fifteen seconds. `''` is not sent.
   */
  const worth = /@|\[\[/.test(text);
  const spans = useMentionSpans(worth ? text : '', 300);
  // Keep the last answer while the next one is on its way, so a chip does not
  // blink out from under the hand; `spanIntact` drops the ones that moved.
  const last = useRef<Span[]>([]);
  if (spans) last.current = spans;
  const current = spans ?? last.current;
  const segments = useMemo(() => mirrorSegments(text, current), [text, current]);
  /*
   * §92: the mirror is for the box you are *in*. Out of focus the box shows
   * `MentionPreview` — chips without brackets, like the reading face — and a
   * mirror with dimmed brackets on top of that would be two pictures of one
   * box. So the mirror only measures, and only draws, while the box has focus.
   */
  const focused = useBoxFocus(box);
  const active = Boolean(box) && focused && !disabled && segments.some((segment) => segment.span);

  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const drag = useRef<{ start: number; x: number; y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  /*
   * Where the mirror hangs: in the box's own `offsetParent`, positioned with
   * the box's own offsets. That is the same containing block the box is laid
   * out in, so the two move together — through a page scroll, a sheet sliding
   * in, a prikbord's transform — without a single listener. A portal, because
   * the mirror may not be a child of whatever the box's parent renders.
   */
  /*
   * §56: the portal goes to `document.body`, never to the box's own
   * `offsetParent`. Hanging it in the parent looked neater — `offsetLeft` and
   * `offsetTop` are layout pixels, so a prikbord's zoom needed no dividing out
   * — but that parent is a container React is itself reconciling, and a node
   * dropped into it corrupted the bookkeeping: the very next update to the box
   * (the §7 handover swapping the plain box for the room's bound one) went
   * wrong, the empty room won, and what had just been typed was gone with no
   * error and no save. `MentionPopover` right above already learnt this and
   * says so; the mirror now measures with `getBoundingClientRect` and sits
   * `fixed`, exactly as it does.
   */
  const host = box && typeof document !== 'undefined' ? document.body : null;

  useEffect(() => {
    const el = box;
    if (!el || !active || !host) return;
    const sync = () => {
      const mirror = mirrorRef.current;
      // Viewport pixels, because the mirror is `fixed` in the body.
      const rect = el.getBoundingClientRect();
      const next = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      setPlace((previous) =>
        previous && previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
      if (!mirror) return;
      const computed = getComputedStyle(el);
      for (const key of MIRROR_STYLES) mirror.style[key] = computed[key];
      // A one-line box does not wrap and scrolls sideways; a textarea wraps and
      // keeps its newlines. And an `<input>` centres its line in its content
      // box, which is what the mirror's `align-items` is for.
      const single = el instanceof HTMLInputElement;
      mirror.style.whiteSpace = single ? 'pre' : 'pre-wrap';
      mirror.style.alignItems = single ? 'center' : 'flex-start';
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
    };
    sync();
    /*
     * Every scroll between the box and the body, every keystroke and every
     * resize wants a re-measure, and a re-measure reads the layout and writes
     * twenty computed properties. Coalesced to one a frame: without it a page
     * with a handful of boxes on it spent its time in `getComputedStyle`, and
     * what that looked like from the outside was every *other* thing on the
     * page — a save, a room, a second browser — arriving late.
     */
    let frame = 0;
    const soon = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    /*
     * A sheet slides in, an accordion opens, a textarea grows as it is typed:
     * none of those fire scroll, resize or input, and a `transitionend` only
     * comes from the element that transitions, which is an ancestor we do not
     * hold. So the mirror re-measures a few times over the first half second
     * after it mounts and then stops. Not a permanent loop: a re-measure reads
     * the layout, and one of those a frame for the life of the page is what
     * made everything else on it late.
     */
    const settle = [50, 150, 300, 600].map((ms) => setTimeout(soon, ms));
    const onScroll = () => {
      const mirror = mirrorRef.current;
      if (!mirror) return;
      mirror.scrollTop = el.scrollTop;
      mirror.scrollLeft = el.scrollLeft;
    };
    el.addEventListener('scroll', onScroll);
    el.addEventListener('input', soon);
    window.addEventListener('resize', soon);
    // Fixed to the viewport, so every scroll between here and the body moves
    // the box out from under it. Capture, to hear the ones that do not bubble.
    window.addEventListener('scroll', soon, true);
    // A textarea can be dragged taller, and the box grows as it is typed in.
    // The box only. `host` is the body now, and observing that is both
    // pointless (the mirror is `fixed`, so it changes no layout) and noisy —
    // on a phone the body grows as the page does, and every one of those was a
    // re-measure of twenty computed properties.
    const observer = new ResizeObserver(soon);
    observer.observe(el);
    // §56, round 29: and the field the box stands in. The chip row under the
    // box (§54) arrives a beat after a name resolves, the field grows, and a
    // sheet centred on the screen moves the box half that growth upward —
    // none of which fires scroll, resize or input, and it lands after the
    // settle timers have run. The field is one element, so this is not the
    // body-observing noise the comment above is about.
    if (el.parentElement) observer.observe(el.parentElement);
    // The box's own letters are not drawn — the mirror draws them — but the
    // caret and the selection still belong to the box.
    el.classList.add('mention-lit');
    return () => {
      for (const timer of settle) clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('input', soon);
      window.removeEventListener('resize', soon);
      window.removeEventListener('scroll', soon, true);
      observer.disconnect();
      el.classList.remove('mention-lit');
    };
  }, [box, active, host]);

  // After the mirror has been re-drawn (a keystroke, a chip arriving), its
  // scroll must match the box's again or the last line drifts.
  useEffect(() => {
    const el = box;
    const mirror = mirrorRef.current;
    if (!el || !mirror) return;
    mirror.scrollTop = el.scrollTop;
    mirror.scrollLeft = el.scrollLeft;
  });

  // §56: a one-line `<input>` gets no mirror — see the gate in `LiveFields`.
  // Belt and braces, for a caller that passes one straight in.
  if (!box || !active || !host || box instanceof HTMLInputElement) return null;

  /*
   * A chip takes the pointer, which would otherwise swallow a selection that
   * *starts* on a name. So the chip does the selecting itself: the mirror holds
   * the very same characters as the box, so a point on it is a character index
   * (`indexFromPoint`), and a drag from a chip sets the box's selection by
   * hand. A press that does not move is a click, and the `<a>` navigates.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const chip = (event.target as HTMLElement).closest('a.mention-live') as HTMLElement | null;
    const mirror = mirrorRef.current;
    if (!chip || !mirror || event.button !== 0) return;
    const start = indexFromPoint(mirror, event.clientX, event.clientY);
    if (start === null) return;
    drag.current = { start: Math.min(start, box.value.length), x: event.clientX, y: event.clientY, moved: false };
    // Hit-test the mirror everywhere while the drag lasts, not just the chips.
    mirror.style.pointerEvents = 'auto';
    chip.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const mirror = mirrorRef.current;
    if (!state || !mirror) return;
    if (!state.moved && Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) < 5) return;
    const here = indexFromPoint(mirror, event.clientX, event.clientY);
    if (here === null) return;
    if (!state.moved) {
      state.moved = true;
      box.focus({ preventScroll: true });
    }
    const to = Math.min(here, box.value.length);
    box.setSelectionRange(Math.min(state.start, to), Math.max(state.start, to), to < state.start ? 'backward' : 'forward');
  };
  const endDrag = () => {
    const mirror = mirrorRef.current;
    if (mirror) mirror.style.pointerEvents = '';
    swallowClick.current = Boolean(drag.current?.moved);
    drag.current = null;
  };

  return createPortal(
    <div
      ref={mirrorRef}
      className="mention-mirror"
      aria-hidden="true"
      data-testid="mention-mirror"
      style={{
        position: 'fixed',
        // The width and the height are the box's `offsetWidth`/`offsetHeight`,
        // which are border-box numbers whatever the box's own box-sizing is.
        boxSizing: 'border-box',
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        width: place?.width ?? 0,
        height: place?.height ?? 0,
        visibility: place ? 'visible' : 'hidden',
      }}
      onPointerDown={onPointerDown}
      // §92: a press on a chip must not take the focus off the box — the
      // mirror is only there while the box has it, so a chip that stole it
      // would take the mirror (and itself) away between press and click. The
      // click still comes, and the `<a>` still navigates.
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('a.mention-live')) event.preventDefault();
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={(event) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.preventDefault();
      }}
    >
      <div className="mention-mirror-text">
      {segments.map((segment, i) => {
        const span = segment.span;
        if (!span) return <span key={i}>{segment.text}</span>;
        if (!span.entryId || !span.slug) {
          // A name that matches nothing: the same dead treatment the reading
          // face gives it, and it does not take the pointer.
          return (
            <span key={i} className="mention-live mention-live-missing">
              {segment.text}
            </span>
          );
        }
        return (
          <a
            key={i}
            className="mention-live"
            // The mirror is `aria-hidden` — it is a picture of the box, and a
            // screen reader must hear the box itself — so its chips are out of
            // the tab order too. The box itself is what a keyboard and a
            // reader get (§92: the row under it is gone).
            tabIndex={-1}
            href={`/e/${span.slug}`}
            data-entry-id={span.entryId}
            data-entry-slug={span.slug}
            data-entry-icon={span.icon ?? ''}
            style={span.colour ? ({ ['--chip-colour' as string]: span.colour } as React.CSSProperties) : undefined}
          >
            {chipRuns(segment.text)}
          </a>
        );
      })}
      {/* A box ending in a newline has one more line than a div does; a
          zero-width character after everything gives the mirror that line
          without moving a single letter before it. */}
      {'​'}
      </div>
    </div>,
    host,
  );
}

/** `[[Naam]]` or `@Naam`, with its punctuation dimmed — and still there. */
function chipRuns(raw: string): React.ReactNode[] {
  if (raw.startsWith('[[') && raw.endsWith(']]') && raw.length >= 4) {
    return [
      <span key="o" className="mention-live-punct">
        [[
      </span>,
      raw.slice(2, -2),
      <span key="c" className="mention-live-punct">
        ]]
      </span>,
    ];
  }
  if (raw.startsWith('@')) {
    return [
      <span key="a" className="mention-live-punct">
        @
      </span>,
      raw.slice(1),
    ];
  }
  return [raw];
}

/* ------------------------------------------ §92: het vak buiten focus (c+) */

/**
 * §92: does this box have the focus? Follows the element through `focus` and
 * `blur`, and starts from `document.activeElement` so a box that mounts with
 * the caret already in it (a sheet's first field) is not drawn over.
 */
export function useBoxFocus(box: MentionBox | null): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!box) {
      setFocused(false);
      return;
    }
    setFocused(document.activeElement === box);
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    box.addEventListener('focus', on);
    box.addEventListener('blur', off);
    return () => {
      box.removeEventListener('focus', on);
      box.removeEventListener('blur', off);
    };
  }, [box]);
  return focused;
}

/** The typography of the box, so the preview's letters land where the box's do. */
const PREVIEW_STYLES = MIRROR_STYLES;

/**
 * §92, ronde 53 — **variant c+**: een kort vak toont zich buiten focus als wat
 * het is.
 *
 * Nick: *"in de korte descriptions wordt `[[]]` gebruikt en tijdens het editen
 * is het allemaal niet zo netjes als in de rest van de secties."* Wat er
 * stond: `[[Pier Boone]]` letterlijk in het vak, en daaronder een regel
 * "Verwijst naar Pier Boone" (§54) die de "gekke hyperlinks" waren.
 *
 * Nu: zolang het vak geen focus heeft, ligt hier een voorvertoning over — in
 * dezelfde doos, met de typografie van het vak zelf gekopieerd — die de tekst
 * toont zoals de leeskant hem toont: chips, geen haakjes. De voorvertoning
 * neemt de aanwijzer niet (`pointer-events: none`), alleen haar chips doen dat:
 * klik je ernaast, dan klik je in het vak zelf — de caret staat erin, de poort
 * van §18b hoort het zoals altijd, en in focus staat de ruwe tekst. Klik je óp
 * een chip, dan volg je de link, net als in de lopende tekst in Lezen.
 *
 * (Een eerste versie nam de hele klik en zette de caret zelf op de letter die
 * je aanwees. Dat lag dan óver het vak, en elk gebaar dat het vak zelf wil
 * raken — een test die erin klikt, een hulpmiddel dat het aanwijst — raakte de
 * voorvertoning in plaats van het vak. Het vak is het ding; dit is een plaatje.)
 *
 * **Waarom dit wél op de live vakken mag, waar §56's spiegel niet mocht.** De
 * spiegel hing in een portal en mat zich elke toets opnieuw, terwijl het vak
 * van een gewoon element naar het kamervak van de room werd overgedragen (§7).
 * Deze voorvertoning is een gewoon React-kind naast het vak, in een eigen
 * `.mention-field` die er vanaf de eerste render staat, dus de overdracht
 * verandert niets aan de boom eromheen. Hij raakt het vak niet aan (geen
 * `value`, geen `onChange`, geen listener behalve `focus`/`blur`), meet alleen
 * als het vak van maat verandert, en is weg zolang er getypt wordt — dan is er
 * dus ook geen enkele vraag aan het archief per toets.
 *
 * Ronde 56 vervangt dit door een editor van één regel die de chip zelf in de
 * tekst houdt; tot die tijd is dit de brug.
 */
export function MentionPreview({
  element,
  forRef,
  value,
}: {
  /** The box as state — a `LiveField`, whose element is swapped when the room arrives. */
  element?: MentionBox | null;
  /** Or through a ref, for a plain box a component owns. */
  forRef?: RefObject<MentionBox | null>;
  /** The text the box holds; the parent's copy, which the room keeps current. */
  value: string;
}) {
  const [fromRef, setFromRef] = useState<MentionBox | null>(null);
  useEffect(() => {
    if (forRef) setFromRef(forRef.current ?? null);
  });
  const box = element ?? fromRef ?? null;
  const focused = useBoxFocus(box);

  const worth = /@|\[\[/.test(value);
  const spans = useMentionSpans(worth && !focused ? value : '');
  const segments = useMemo(() => previewSegments(value, worth ? spans : []), [value, worth, spans]);
  const show = Boolean(box) && !focused && worth && previewWorth(segments);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const el = box;
    if (!el || !show) return;
    const sync = () => {
      /*
       * The box's offsets inside `.mention-field`, which is positioned and is
       * therefore its `offsetParent`: margins, a negative indent and a box that
       * grows as it is typed all come along without a single scroll listener,
       * because the preview is laid out in the same containing block.
       */
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      setPlace((previous) =>
        previous && previous.left === next.left && previous.top === next.top && previous.width === next.width && previous.height === next.height
          ? previous
          : next,
      );
      const preview = previewRef.current;
      if (!preview) return;
      const computed = getComputedStyle(el);
      for (const key of PREVIEW_STYLES) preview.style[key] = computed[key];
      const single = el instanceof HTMLInputElement;
      preview.style.whiteSpace = single ? 'pre' : 'pre-wrap';
      preview.style.alignItems = single ? 'center' : 'flex-start';
    };
    sync();
    const observer = new ResizeObserver(() => sync());
    observer.observe(el);
    // The box's text is not drawn while the preview is — the preview draws it.
    el.classList.add('mention-previewed');
    return () => {
      observer.disconnect();
      el.classList.remove('mention-previewed');
    };
  }, [box, show]);

  if (!show || !box) return null;

  return (
    <div
      ref={previewRef}
      className="mention-preview"
      aria-hidden="true"
      data-testid="mention-preview"
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        width: place?.width ?? 0,
        height: place?.height ?? 0,
        visibility: place ? 'visible' : 'hidden',
      }}
    >
      <div className="mention-preview-text">
        {segments.map((segment, i) => {
          if (segment.kind === 'chip') return <MentionChip key={i} span={segment.span} tabIndex={-1} />;
          return <span key={i}>{segment.text}</span>;
        })}
      </div>
    </div>
  );
}
