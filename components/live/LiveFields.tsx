'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useState, type ComponentType, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';

export { textDelta } from '@/lib/live/textDelta';

/**
 * §21: a record's short texts as shared fields.
 *
 * `<LiveFields room state …>` joins the record's `fields` room — one Yjs
 * document with a Y.Text per field — and every `<LiveField field="name">`
 * inside it binds an ordinary `<input>` or `<textarea>` to one of those texts.
 * Ten people can type in the same name at once: each keystroke is an insert or
 * delete at a position, Yjs merges them, and nobody's letters are lost. The
 * person typing gets a coloured border and a name tag on the field, the way a
 * card someone holds on a board does.
 *
 * Without a room (no `<LiveFields>` around it, a viewer who may only look, or
 * the server render and the first client render, before the client-only room
 * has loaded) a `LiveField` is a plain controlled input: the parent's `value`
 * and `onValue`, the parent's autosave, the proposal road for someone without
 * edit rights. The parent is told which road it is on, so it can skip its own
 * save when the room is doing the saving.
 *
 * Everything that touches Yjs lives in `LiveFieldsRoom.tsx`, loaded with
 * `ssr: false` — so this file, which every page imports, carries no Yjs.
 */

export type FieldsValue = {
  doc: Y.Doc;
  awareness: Awareness;
  /** May this tab type into the room. */
  canEdit: boolean;
  status: LiveStatus;
  synced: boolean;
  others: LivePerson[];
  save: LiveSave;
  /** The bound input, from the client-only module. */
  Bound: ComponentType<FieldProps & { fields: FieldsValue }>;
};

const FieldsContext = createContext<FieldsValue | null>(null);

/** The room around this component, or null — for a parent that wants to know which road it is on. */
export function useLiveFields(): FieldsValue | null {
  return useContext(FieldsContext);
}

const LiveFieldsRoom = dynamic(() => import('./LiveFieldsRoom').then((m) => m.LiveFieldsRoom), { ssr: false });

export function LiveFields({
  room,
  state,
  user,
  canEdit,
  onStatus,
  children,
}: {
  room: string;
  /** The room as the server had it when the page was made (base64 Yjs update). */
  state: string;
  user: LiveUser;
  /** The room's gate for this viewer, as the page computed it. */
  canEdit: boolean;
  onStatus?: (status: { others: LivePerson[]; status: LiveStatus; save: LiveSave }) => void;
  children: ReactNode;
}) {
  const [value, setValue] = useState<FieldsValue | null>(null);
  const onRoom = useCallback((next: FieldsValue | null) => setValue(next), []);
  return (
    <FieldsContext.Provider value={value}>
      <LiveFieldsRoom room={room} state={state} user={user} canEdit={canEdit} onRoom={onRoom} onStatus={onStatus} />
      {children}
    </FieldsContext.Provider>
  );
}

/* ------------------------------------------------------------- the field */

type Common = {
  /** The Y.Text's name in the room: `name`, `summary`, `field.<key>`. */
  field: string;
  /** React 19: the element, for a parent that autosizes or focuses it. */
  ref?: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
  /** The parent's copy, used when there is no room, and kept current by the room when there is. */
  value: string;
  /** Every change, from this keyboard or another. `live` says whether the room saves it. */
  onValue: (next: string, meta: { live: boolean }) => void;
  onBlur?: () => void;
};

export type InputProps = Common & { as?: 'input' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type TextareaProps = Common & { as: 'textarea' } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type FieldProps = InputProps | TextareaProps;

export function LiveField(props: FieldProps) {
  const fields = useContext(FieldsContext);
  if (fields) {
    const Bound = fields.Bound;
    return <Bound {...props} fields={fields} />;
  }
  return <PlainField {...props} />;
}

function PlainField(props: FieldProps) {
  const { field: _field, value, onValue, onBlur, as, ref, ...rest } = props;
  void _field;
  if (as === 'textarea') {
    return (
      <textarea
        {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        ref={ref as React.Ref<HTMLTextAreaElement>}
        value={value}
        onChange={(event) => onValue(event.target.value, { live: false })}
        onBlur={onBlur}
      />
    );
  }
  return (
    <input
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      ref={ref as React.Ref<HTMLInputElement>}
      value={value}
      onChange={(event) => onValue(event.target.value, { live: false })}
      onBlur={onBlur}
    />
  );
}
