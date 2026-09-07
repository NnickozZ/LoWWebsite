'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';

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

/** Puts `text` in place of [from, to) and fires the event the box's owner listens to. */
function replaceRange(el: HTMLTextAreaElement, from: number, to: number, text: string) {
  const next = el.value.slice(0, from) + text + el.value.slice(to);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
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
  /** The box, through a ref that does not change (a plain textarea a component owns). */
  forRef?: RefObject<HTMLTextAreaElement | null>;
  /** Or the box as state — for a box that is swapped under the ref, like a `LiveField` when its room arrives. */
  element?: HTMLTextAreaElement | null;
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
    };
    const onKey = (event: KeyboardEvent) => {
      if (!openRef.current) return;
      const list = itemsRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'ArrowDown' && list.length) {
        event.preventDefault();
        setActive((activeRef.current + 1) % list.length);
      } else if (event.key === 'ArrowUp' && list.length) {
        event.preventDefault();
        setActive((activeRef.current - 1 + list.length) % list.length);
      } else if ((event.key === 'Enter' || event.key === 'Tab') && list.length) {
        event.preventDefault();
        event.stopPropagation();
        pick(list[activeRef.current] ?? list[0]);
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
    (el as HTMLTextAreaElement & { __mentionPick?: (item: Suggestion) => void }).__mentionPick = pick;
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

  if (!open || !items.length) return null;
  const pick = (item: Suggestion) => (target as (HTMLTextAreaElement & { __mentionPick?: (item: Suggestion) => void }) | null)?.__mentionPick?.(item);
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
    </ul>,
    document.body,
  );
}

/**
 * Plain text with its `[[Naam]]`s shown as chips — how a kaart, a speld or a
 * gebeurtenis prints what was typed into it. `@Naam` stays as typed: where
 * the name ends is only known to the reader with the index, and a chip that
 * is one word too long is worse than none.
 */
export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(\[\[[^\]\n]{1,120}\]\])/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[\[([^\]\n]{1,120})\]\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span key={i} className="mention-chip">
            {m[1]}
          </span>
        );
      })}
    </>
  );
}
