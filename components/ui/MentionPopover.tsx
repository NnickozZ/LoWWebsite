'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { useMentionFiling } from '@/components/cases/useMentionFiling';
import { useUi } from './UiProvider';

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
  const m = /(^|[\s(“"'])(@|\[\[)([^\n@[\]]{0,60})$/.exec(head);
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
function replaceRange(el: MentionBox, from: number, to: number, text: string) {
  const next = el.value.slice(0, from) + text + el.value.slice(to);
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  const caret = from + text.length;
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
  const [open, setOpen] = useState<{ start: number; query: string; rect: { left: number; top: number; width: number } } | null>(null);
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
      if (!hit) {
        if (openRef.current) setOpen(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setOpen({ start: hit.start, query: hit.query, rect: { left: r.left, top: r.bottom, width: r.width } });
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
        close();
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
    };
    el.addEventListener('input', look);
    el.addEventListener('click', look);
    el.addEventListener('keyup', look);
    el.addEventListener('keydown', onKey, true);
    el.addEventListener('blur', onBlur);
    (el as MentionBox & { __mentionPick?: (item: Suggestion) => void }).__mentionPick = pick;
    return () => {
      el.removeEventListener('input', look);
      el.removeEventListener('click', look);
      el.removeEventListener('keyup', look);
      el.removeEventListener('keydown', onKey, true);
      el.removeEventListener('blur', onBlur);
    };
  }, [target, disabled]);

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
   * dossier is handed in as the place it is being made, and `askToFile` makes
   * the filing a tickbox rather than something that silently happened.
   */
  const typed = open?.query.trim() ?? '';
  const start = open?.start ?? 0;
  const create = (name: string) => {
    const el = target;
    if (!el || !name) return;
    setOpen(null);
    ui.openNewEntry({
      name,
      caseId: here?.id,
      askToFile: Boolean(here),
      onCreated: (entry) => {
        const caret = Math.max(start, Math.min(el.value.length, el.selectionStart ?? el.value.length));
        replaceRange(el, start, caret, `[[${entry.name}]] `);
        el.focus();
        linkedRef.current({ id: entry.id, name: entry.name }, entry.filed);
      },
    });
  };
  createRef.current = create;

  if (!open || (!items.length && !typed)) return null;
  const pick = (item: Suggestion) => (target as (MentionBox & { __mentionPick?: (item: Suggestion) => void }) | null)?.__mentionPick?.(item);
  // In a portal: a `position: fixed` box inside a transformed ancestor (a
  // prikbord's canvas, a sheet sliding in) is fixed to that ancestor, not to
  // the screen, and lands under whatever is drawn over it.
  return createPortal(
    <ul
      className="suggest-list mention-pop"
      role="listbox"
      aria-label="Artikelen"
      style={{ position: 'fixed', left: open.rect.left, top: open.rect.top + 2, width: Math.max(220, Math.min(360, open.rect.width)), zIndex: 60, margin: 0 }}
      data-testid="mention-pop"
    >
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            className="suggest-item"
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
            <Icon name={item.typeIcon || 'file'} size={14} style={{ color: item.typeColour || 'var(--ink-muted)' }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block' }}>{item.name}</span>
              {(item.typeLabel || item.originCaseName) && (
                <span className="tiny muted">{[item.typeLabel, item.originCaseName].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </button>
        </li>
      ))}
      {typed && (
        <li>
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
            <Icon name="plus" size={14} style={{ color: 'var(--stamp-red)' }} />
            <span>
              &lsquo;<strong>{typed}</strong>&rsquo; aanmaken
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
export function MentionChip({ span, flat }: { span: Span; flat?: boolean }) {
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
export function MentionText({ text, flat }: { text: string; flat?: boolean }) {
  const spans = useMentionSpans(text);
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

/**
 * The chips of a text on their own line, for the one place a chip cannot live
 * in the text itself: a box you are typing in. A textarea holds characters and
 * nothing else, so the gebeurtenis sheet and the speld sheet print what the
 * writing refers to underneath it, clickable while you write.
 */
export function MentionRow({ text }: { text: string }) {
  const spans = useMentionSpans(text, 400);
  // While the next answer is on its way the row keeps the last one, so a chip
  // does not blink out from under the hand between two keystrokes.
  const last = useRef<Span[]>([]);
  if (spans) last.current = spans;
  // One chip per artikel, however often the writing names it.
  const seen = new Set<string>();
  const named = (spans ?? last.current).filter((s) => s.entryId && !seen.has(s.entryId) && seen.add(s.entryId));
  if (!named.length) return null;
  return (
    <p className="tiny row-wrap" style={{ gap: '0.3rem', margin: '0.35rem 0 0', alignItems: 'baseline' }}>
      <span className="muted">Verwijst naar</span>
      {named.map((span, i) => (
        <MentionChip key={i} span={span} />
      ))}
    </p>
  );
}
