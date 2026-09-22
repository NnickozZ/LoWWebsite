'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useState, type ComponentType, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { MentionPopover, MentionPreview, MentionText, type MentionBox } from '@/components/ui/MentionPopover';
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
// §95: the short box is Tiptap, and Tiptap stays out of the shell until a box is on screen.
const ShortEditor = dynamic(() => import('@/components/editor/ShortEditor'), { ssr: false });

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
  /**
   * §92 (A8): a box that promises one line — de korte beschrijving, de
   * samenvatting, een infoboxveld Tekst. Enter leaves the box instead of
   * starting a second line that every list and card would then have to hide.
   * Not on a Lange tekst, which is where a new line belongs.
   */
  enterLeaves?: boolean;
};

export type InputProps = Common & { as?: 'input' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type TextareaProps = Common & { as: 'textarea' } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur' | 'ref'>;
export type FieldProps = InputProps | TextareaProps;

export function LiveField(props: FieldProps) {
  const { mentions, enterLeaves, ...rest } = props;
  // §92 (A8): Enter leaves a one-line box. The `@`-list swallows Enter itself
  // while it is open (in the capture phase, on the box), so a pick still lands.
  const ownKeyDown = rest.onKeyDown as ((event: React.KeyboardEvent<MentionBox>) => void) | undefined;
  const plain = (
    enterLeaves
      ? {
          ...rest,
          onKeyDown: (event: React.KeyboardEvent<MentionBox>) => {
            ownKeyDown?.(event);
            if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.blur();
          },
        }
      : rest
  ) as FieldProps;
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
    /*
     * §92: the box and its preview in one positioned block, from the very
     * first render — so the §7 handover (plain box → the room's bound one)
     * swaps one child inside a block that never moves, exactly as it swapped
     * one child inside a fragment before.
     */
    <div className="mention-field">
      {field}
      <MentionPopover element={mentionEl} disabled={plain.readOnly} />
      {/* §92, c+: out of focus the box shows its chips, like the reading face;
          in focus it holds the raw text. This is what §56 could not do here
          and why: its mirror was a portal that re-measured on every keystroke
          while the handover ran. `MentionPreview` is an ordinary child of this
          block, touches neither the box's value nor its events, and is gone
          the moment the box has the focus — see its own comment. §56's
          `MentionOverlay` stays off the live boxes, for §56's reason. And the
          row under the box (§54, `MentionRow`) is gone everywhere. */}
      <MentionPreview element={mentionEl} value={plain.value} />
    </div>
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

/* ---------------------------------------------------- §95: a short box */

export type ShortFieldProps = {
  /** The Y.Text's name in the room: `shortDescription`, `summary`, `field.<key>`. */
  field: string;
  id: string;
  className?: string;
  value: string;
  onValue: (next: string, meta: { live: boolean }) => void;
  onBlur?: () => void;
  /** A Lange tekst: Enter is a new line. Everything else leaves on Enter. */
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  autoFocus?: boolean;
  /** A maakblad: the record does not exist yet, so there is no room to join. */
  noRoom?: boolean;
  onElement?: (el: HTMLElement | null) => void;
  /** Enter does this instead of leaving the box (a sheet whose Enter submits). */
  onEnter?: () => void;
  /**
   * A maakblad's box is not behind §18b's gate: making an artikel is the one
   * write a speler with no onderzoeker may do, and its description comes with
   * it. The plain textarea that stood here was never gated either.
   */
  ungated?: boolean;
};

/**
 * §95, ronde 56: een kort vak met chips — de korte beschrijving, de
 * samenvatting, een infoboxveld Tekst of Lange tekst, en de twee maakbladen.
 *
 * Wat `LiveField` is voor een naam, is dit voor een tekst waarin je een artikel
 * noemt: in een `<LiveFields>` bindt het vak aan dezelfde `Y.Text` van dezelfde
 * kamer (§21, en de overdracht van §25 is dezelfde), daarbuiten is het een gewoon
 * vak op de autosave van de ouder. Het verschil zit in wat erin staat: geen
 * `[[Naam]]` meer, maar een chip met een handvat (`ShortEditor`).
 *
 * De editor is Tiptap en wordt pas geladen als er een vak op het scherm staat;
 * tot hij er is, staat op zijn plek wat hij gaat tonen — dezelfde tekst met
 * dezelfde chips, zonder caret — zodat de bladzijde niet verspringt.
 */
export function ShortField(props: ShortFieldProps) {
  const fields = useContext(FieldsContext);
  const mayType = useMayType() || Boolean(props.ungated);
  const authorGate = useAuthorGate();
  const gate = props.ungated ? {} : authorGate;
  const [mounted, setMounted] = useState(false);
  const onMounted = useCallback(() => setMounted(true), []);
  const room =
    fields && !props.noRoom
      ? { doc: fields.doc, awareness: fields.awareness, field: props.field, canEdit: fields.canEdit, synced: fields.synced }
      : null;
  const className = props.className ?? 'input';
  return (
    <div className="short-box" {...gate}>
      {!mounted && (
        <div className={`${className} short-editor short-fallback`} aria-hidden="true" data-placeholder={props.placeholder} data-empty={props.value ? undefined : 'true'}>
          <MentionText text={props.value} tokens />
        </div>
      )}
      <ShortEditor
        id={props.id}
        className={className}
        value={props.value}
        onValue={props.onValue}
        onBlur={props.onBlur}
        multiline={props.multiline}
        placeholder={props.placeholder}
        readOnly={props.readOnly || !mayType}
        ariaLabel={props.ariaLabel}
        ariaLabelledBy={props.ariaLabelledBy}
        ariaDescribedBy={props.ariaDescribedBy}
        autoFocus={props.autoFocus}
        room={room}
        onMounted={onMounted}
        onElement={props.onElement}
        onEnter={props.onEnter}
      />
    </div>
  );
}
