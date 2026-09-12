'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useState, type ComponentType, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { MentionPopover, type MentionBox } from '@/components/ui/MentionPopover';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { LivePerson, LiveSave, LiveStatus, LiveUser } from '@/components/editor/useLiveDoc';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';

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
  /**
   * Round 18, textareas: offer artikel names on `@` and `[[` (see
   * `MentionPopover`). §48, round 25: one-line boxes too — a dossier's
   * samenvatting and an infobox Tekst are `<input>`s, and they are exactly
   * where somebody reaches for a name.
   */
  mentions?: boolean;
};

export type InputProps = Common & { as?: 'input' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type TextareaProps = Common & { as: 'textarea' } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type FieldProps = InputProps | TextareaProps;

export function LiveField(props: FieldProps) {
  const { mentions, ...plain } = props;
  const fields = useContext(FieldsContext);
  // Round 18: a textarea that offers artikel names on `@` — the popover
  // attaches to the element through a ref and writes into it like a
  // keystroke, so the bound room and the plain box both hear it.
  // As state, not a ref: the box is swapped for the room's bound one when
  // the room arrives (`next/dynamic`), and the popover must follow it.
  const [mentionEl, setMentionEl] = useState<MentionBox | null>(null);
  const withRef =
    mentions
      ? ({
          ...plain,
          ref: (el: MentionBox | null) => {
            setMentionEl((current) => (current === el ? current : el));
            const outer = plain.ref;
            if (typeof outer === 'function') outer(el);
            else if (outer) (outer as React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>).current = el;
          },
        } as FieldProps)
      : plain;
  const field = <LiveFieldInner {...withRef} fields={fields} />;
  if (!mentions) return field;
  return (
    <>
      {field}
      <MentionPopover element={mentionEl} disabled={plain.readOnly} />
      {/* §56: no `MentionOverlay` here, and that is a decision, not an
          oversight. A box in a `LiveFields` room is handed over from a plain
          element to the room's bound one (§7), and anything mounted beside it
          shifts that moment: the still-empty room won, and what had just been
          typed was gone — no error, no failed save, nothing on screen. Moving
          the mirror's portal to the body (where it belongs) fixed the worst of
          it, but the rooms stayed marginal: saves that used to land in two
          seconds were still timing out at fifteen under load. A chip in the
          box is a decoration; the writing is the archive. So the live boxes —
          de korte beschrijving, de samenvatting, Tekst en Lange tekst — keep
          their clickable chips *under* the box (`MentionRow`, §54), and the
          overlay is used only where there is no room to race: the sheets, een
          kaartje op de muur, een speld, een gebeurtenis. Making it safe here
          means making that handover safe first. */}
    </>
  );
}

function LiveFieldInner({ fields, ...props }: FieldProps & { fields: FieldsValue | null }) {
  /*
   * §18b: one gate for every short text in the archive — an artikel's name and
   * one-liner, a dossier's, an infobox field, the name on a speld, the words a
   * tijdlijn keeps about a gebeurtenis. Both roads are covered, the room's
   * bound input and the plain one, because a person with no onderzoeker must
   * not be typing into either. Nobody passes the capture handlers themselves,
   * so setting them here takes nothing away.
   */
  const mayType = useMayType();
  const gate = useAuthorGate();
  const gated = { ...props, ...gate, readOnly: props.readOnly || !mayType } as FieldProps;
  if (fields) {
    const Bound = fields.Bound;
    return <Bound {...gated} fields={fields} />;
  }
  return <PlainField {...gated} />;
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
