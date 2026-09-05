'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as Y from 'yjs';
import { useLiveDoc, type LivePerson, type LiveSave, type LiveStatus, type LiveUser } from '@/components/editor/useLiveDoc';
import { textDelta } from '@/lib/live/textDelta';
import type { FieldProps, FieldsValue } from './LiveFields';

/**
 * §21: the client-only half of the shared fields. Everything that touches
 * Yjs is in this file, and this file is only ever loaded with `ssr: false`
 * (see `LiveFields.tsx`): a Y.Doc and an Awareness made during a server
 * render would be a timer leaked per request, and a second copy of Yjs on the
 * server is what README rule 13 forbids.
 */

/** Joins the room and hands the parent what its fields need. Renders nothing. */
export function LiveFieldsRoom({
  room,
  state,
  user,
  canEdit,
  onRoom,
  onStatus,
}: {
  room: string;
  state: string;
  user: LiveUser;
  canEdit: boolean;
  onRoom: (value: FieldsValue | null) => void;
  onStatus?: (status: { others: LivePerson[]; status: LiveStatus; save: LiveSave }) => void;
}) {
  const live = useLiveDoc({ room, user, initialState: state });
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    onStatusRef.current?.({ others: live.others, status: live.status, save: live.save });
  }, [live.others, live.status, live.save]);

  const mayType = live.canEdit ?? canEdit;
  useEffect(() => {
    onRoom({
      doc: live.doc,
      awareness: live.awareness,
      canEdit: mayType,
      status: live.status,
      synced: live.synced,
      others: live.others,
      save: live.save,
      Bound: BoundField,
    });
  }, [live.doc, live.awareness, mayType, live.status, live.synced, live.others, live.save, onRoom]);
  useEffect(() => () => onRoom(null), [onRoom]);
  return null;
}

function assignRef(target: React.Ref<HTMLInputElement | HTMLTextAreaElement> | undefined, el: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!target) return;
  if (typeof target === 'function') target(el);
  else (target as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current = el;
}

export function BoundField(props: FieldProps & { fields: FieldsValue }) {
  const { field, value, onValue, onBlur, as, fields, readOnly, ref: outerRef, ...rest } = props;
  const { doc, awareness, canEdit, synced } = fields;
  const origin = useId();
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      ref.current = el;
      assignRef(outerRef, el);
    },
    [outerRef],
  );
  const text = doc.getText(field);
  const [shown, setShown] = useState(() => text.toString());
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  // Where this person's caret is, as a position *in the shared text* rather than
  // a number — so when someone else inserts three letters before it, it stays
  // on the same letter instead of the same index.
  const selection = useRef<{ start: Y.RelativePosition; end: Y.RelativePosition } | null>(null);
  const rememberSelection = useCallback(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    selection.current = {
      start: Y.createRelativePositionFromTypeIndex(text, start),
      end: Y.createRelativePositionFromTypeIndex(text, end),
    };
  }, [text]);

  const restore = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const pos = restore.current;
    restore.current = null;
    if (!el || !pos || document.activeElement !== el) return;
    try {
      el.setSelectionRange(pos.start, pos.end);
    } catch {
      /* a type of input with no selection */
    }
  }, [shown]);

  useEffect(() => {
    const onChange = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      const next = text.toString();
      if (transaction.origin !== origin && selection.current && document.activeElement === ref.current) {
        const start = Y.createAbsolutePositionFromRelativePosition(selection.current.start, doc);
        const end = Y.createAbsolutePositionFromRelativePosition(selection.current.end, doc);
        if (start && end) restore.current = { start: start.index, end: end.index };
      }
      setShown(next);
      onValueRef.current(next, { live: canEdit });
    };
    text.observe(onChange);
    // The room may already differ from what the page rendered (a keystroke landed between).
    const now = text.toString();
    if (now !== shown) {
      setShown(now);
      onValueRef.current(now, { live: canEdit });
    }
    return () => text.unobserve(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, doc, origin, canEdit]);

  /* ------------------------------------------------------------ others */

  const [typist, setTypist] = useState<{ name: string; colour: string } | null>(null);
  useEffect(() => {
    const check = () => {
      let found: { name: string; colour: string } | null = null;
      for (const [key, state] of awareness.getStates()) {
        if (key === doc.clientID) continue;
        const s = state as { field?: string; user?: { name?: string; colour?: string } };
        if (s.field === field && s.user?.name) {
          found = { name: s.user.name, colour: s.user.colour ?? 'var(--ink-muted)' };
          break;
        }
      }
      setTypist((current) => (current?.name === found?.name && current?.colour === found?.colour ? current : found));
    };
    check();
    awareness.on('change', check);
    return () => awareness.off('change', check);
  }, [awareness, doc.clientID, field]);

  const announceFocus = (focused: boolean) => {
    const current = (awareness.getLocalState() ?? {}) as Record<string, unknown>;
    if (!current.user) return; // not announced yet; the field would be filed under nobody
    awareness.setLocalState({ ...current, field: focused ? field : null });
  };

  /* -------------------------------------------------------------- typing */

  const onChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value;
    if (!canEdit) {
      // Look-only: the parent's road (a proposal, or nothing).
      onValueRef.current(next, { live: false });
      return;
    }
    const delta = textDelta(text.toString(), next);
    if (!delta) return;
    doc.transact(() => {
      if (delta.remove) text.delete(delta.at, delta.remove);
      if (delta.insert) text.insert(delta.at, delta.insert);
    }, origin);
    // Our own edit: the DOM already shows it; the observer set `shown` to match.
    rememberSelection();
  };

  const busy = Boolean(typist);
  const style = typist ? ({ ['--field-colour' as string]: typist.colour } as React.CSSProperties) : undefined;
  // Until the room has answered, the parent's text is shown and nothing may be
  // typed into the document: a keystroke merged into an empty local document
  // and then the seeded one would double the text.
  const ready = synced;
  const common = {
    ref: setRef as never,
    value: canEdit && ready ? shown : value,
    readOnly: readOnly || (canEdit && !ready),
    onChange,
    onFocus: () => {
      announceFocus(true);
      rememberSelection();
    },
    onBlur: () => {
      announceFocus(false);
      selection.current = null;
      onBlur?.();
    },
    onSelect: rememberSelection,
    onKeyUp: rememberSelection,
  };

  return (
    <span className={`live-field${busy ? ' live-field-busy' : ''}`} style={style}>
      {as === 'textarea' ? (
        <textarea {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} {...common} />
      ) : (
        <input {...(rest as InputHTMLAttributes<HTMLInputElement>)} {...common} />
      )}
      {typist && <span className="live-field-tag">{typist.name}</span>}
    </span>
  );
}
