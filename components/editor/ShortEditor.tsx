'use client';

import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Node as PmNode } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import type { EditorProps, EditorView } from '@tiptap/pm/view';
import Suggestion from '@tiptap/suggestion';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { useMentionFiling } from '@/components/cases/useMentionFiling';
import { usePreferredCases } from '@/components/entry/PreferredCases';
import { knownChip, rememberChip, requestChips, usePageChips, type ShortChip, type ShortChipMap } from '@/components/ui/ShortChips';
import { alignedDelta, dropDanglingOpeners } from '@/lib/editor/shortBox';
import { CLOSE, OPEN, handlesIn, splitShort, tokenFor } from '@/lib/entries/shortTokens.mjs';
import { makeEntrySuggestion, type SuggestionEntry, type SuggestionRenderState } from './entrySuggestion';
import { SuggestionPopup } from './SuggestionPopup';
import { useRequestCreate } from './useRequestCreate';

/**
 * §95, ronde 56: één regel, één id — het vak zelf.
 *
 * Eén editor voor elk kort vak van het archief: de korte beschrijving van een
 * artikel, de samenvatting van een dossier, een infoboxveld Tekst of Lange
 * tekst, en die van de maakbladen. Een vermelding is hier wat hij in de lopende
 * tekst al was — een chip die je kiest uit dezelfde lijst (`makeEntrySuggestion`,
 * `SuggestionPopup`), die met één Backspace weggaat, en die zijn artikel bij zich
 * draagt in plaats van zijn naam. Wat er bewaard wordt, is een **string**: letters,
 * en per chip `⟦handvat⟧` (`lib/entries/shortTokens.mjs`).
 *
 * Het schema is zo klein als het kan: een document van inline-inhoud, tekst, de
 * chip (`shortChip`) en — alleen voor een Lange tekst — een regeleinde. Enter
 * verlaat een vak van één regel (A8); plakken wordt platte tekst.
 *
 * Met een kamer (`room`) praat de editor zelf met de `Y.Text` van zijn veld, net
 * als `BoundField` dat voor een `<input>` doet: een eigen wijziging gaat als het
 * kleinste verschil de kamer in, een wijziging van een ander komt als één kleine
 * stap terug, zodat de caret op zijn letter blijft staan. De overdracht van het
 * gewone vak naar de kamer (§25) is die van `BoundField`, regel voor regel.
 *
 * Wat deze editor nooit doet: een naam in de tekst zetten. De naam op een chip
 * komt uit `ShortChips` (de pagina, of één gebundelde vraag), per lezer. Een chip
 * waarvoor niets terugkomt, staat er als niets: een lege plek die de caret
 * overslaat, geen grijze chip die zegt dat er iets is dat je niet mag zien.
 */

export type ShortRoom = {
  doc: Y.Doc;
  awareness: Awareness;
  /** The Y.Text's name: `shortDescription`, `summary`, `field.<key>`. */
  field: string;
  canEdit: boolean;
  synced: boolean;
};

export type ShortEditorProps = {
  id?: string;
  className?: string;
  value: string;
  onValue: (next: string, meta: { live: boolean }) => void;
  onBlur?: () => void;
  multiline?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  room?: ShortRoom | null;
  autoFocus?: boolean;
  /** The editor is on the page: the fallback beside it can go. */
  onMounted?: () => void;
  /** §92: the element, for a parent that focuses it. */
  onElement?: (el: HTMLElement | null) => void;
  /** Enter does this instead of leaving the box. */
  onEnter?: () => void;
};

/* ------------------------------------------------------------ the schema */

const ShortDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'inline*',
});

type ChipAttrs = { handle: string; name: string; slug: string; icon: string | null; colour: string | null; hidden: boolean; known: boolean };

const ShortChipNode = Node.create({
  name: 'shortChip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    // Rendered by hand below: nothing of this may spill onto the element as a
    // stray attribute — least of all a name.
    return {
      handle: { default: '', renderHTML: () => ({}) },
      name: { default: '', renderHTML: () => ({}) },
      slug: { default: '', renderHTML: () => ({}) },
      icon: { default: null, renderHTML: () => ({}) },
      colour: { default: null, renderHTML: () => ({}) },
      hidden: { default: false, renderHTML: () => ({}) },
      known: { default: false, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-short-handle]', getAttrs: (el) => ({ handle: (el as HTMLElement).getAttribute('data-short-handle') ?? '' }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ChipAttrs;
    if (attrs.hidden || !attrs.known) {
      // Nothing to draw (or not yet): an empty, zero-width place in the line.
      return ['span', mergeAttributes(HTMLAttributes, { class: 'short-chip-none', 'data-short-handle': attrs.handle, contenteditable: 'false' })];
    }
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'entry-chip short-chip',
        'data-short-handle': attrs.handle,
        'data-entry-slug': attrs.slug,
        'data-entry-icon': attrs.icon ?? '',
        contenteditable: 'false',
        style: attrs.colour && /^#[0-9a-fA-F]{6}$/.test(attrs.colour) ? `--chip-colour:${attrs.colour}` : undefined,
      }),
      attrs.name,
    ];
  },

  // What a copy puts on the clipboard: the words, never the handle.
  renderText({ node }) {
    const attrs = node.attrs as ChipAttrs;
    return attrs.hidden ? '' : attrs.name;
  },
});

/* ------------------------------------------------ string ⇄ document */

function chipAttrs(handle: string, page: ShortChipMap): ChipAttrs {
  const chip = knownChip(page, handle);
  return chip
    ? { handle, name: chip.name, slug: chip.slug, icon: chip.icon, colour: chip.colour, hidden: false, known: true }
    : { handle, name: '', slug: '', icon: null, colour: null, hidden: chip === null, known: chip === null };
}

const clean = (text: string) => text.replace(/[⟦⟧]/g, '');

/** A stored string → the document's inline content. */
export function toInline(text: string, multiline: boolean, page: ShortChipMap): object[] {
  const out: object[] = [];
  for (const part of splitShort(text)) {
    if (part.kind === 'chip') {
      out.push({ type: 'shortChip', attrs: chipAttrs(part.handle, page) });
      continue;
    }
    const lines = clean(part.text).split(/\r?\n/);
    lines.forEach((line, i) => {
      if (i > 0) {
        if (multiline) out.push({ type: 'hardBreak' });
        else if (line || i < lines.length - 1) out.push({ type: 'text', text: ' ' });
      }
      if (line) out.push({ type: 'text', text: line });
    });
  }
  return out;
}

/** The document → the stored string. The inverse of `toInline`, character for character. */
export function serialise(doc: PmNode): string {
  let out = '';
  doc.forEach((node) => {
    if (node.isText) out += clean(node.text ?? '');
    else if (node.type.name === 'shortChip') out += tokenFor((node.attrs as ChipAttrs).handle);
    else if (node.type.name === 'hardBreak') out += '\n';
  });
  return out;
}

/** Where string offset `offset` falls in the document. Offsets inside a token map to its start. */
function posAt(doc: PmNode, offset: number): number {
  let pos = 0;
  let at = 0;
  let found = -1;
  doc.forEach((node, nodePos) => {
    if (found >= 0) return;
    const width = node.isText ? (node.text ?? '').length : node.type.name === 'shortChip' ? tokenFor((node.attrs as ChipAttrs).handle).length : 1;
    if (offset < at + width) {
      found = node.isText ? nodePos + (offset - at) : nodePos + (offset > at ? 1 : 0);
      return;
    }
    at += width;
    pos = nodePos + node.nodeSize;
  });
  return found >= 0 ? found : pos;
}

/** Plain text into the box: no delimiters, and a line break as the box allows it. */
function insertPlain(view: EditorView, raw: string, multiline: boolean) {
  let text = clean(raw);
  text = multiline ? text.replace(/\r\n?/g, '\n') : text.replace(/\s*[\r\n]+\s*/g, ' ');
  if (!text) return;
  const { state } = view;
  const { from, to } = state.selection;
  if (!multiline || !text.includes('\n')) {
    view.dispatch(state.tr.insertText(text, from, to).scrollIntoView());
    return;
  }
  const nodes = text.split('\n').flatMap((line, i) => {
    const parts = [];
    if (i > 0) parts.push(state.schema.nodes.hardBreak.create());
    if (line) parts.push(state.schema.text(line));
    return parts;
  });
  view.dispatch(state.tr.replaceWith(from, to, nodes).scrollIntoView());
}

/* ------------------------------------------------------------- the box */

const AT_KEY = new PluginKey('shortSuggestionAt');
const BRACKET_KEY = new PluginKey('shortSuggestionBrackets');

export default function ShortEditor(props: ShortEditorProps) {
  const {
    id,
    className = 'input',
    value,
    multiline = false,
    placeholder,
    readOnly = false,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedBy,
    room,
    autoFocus,
  } = props;
  const page = usePageChips();
  const pageRef = useRef(page);
  pageRef.current = page;
  const onValueRef = useRef(props.onValue);
  onValueRef.current = props.onValue;
  const onBlurRef = useRef(props.onBlur);
  onBlurRef.current = props.onBlur;
  const onEnterRef = useRef(props.onEnter);
  onEnterRef.current = props.onEnter;
  const origin = useId();

  const roomRef = useRef(room ?? null);
  roomRef.current = room ?? null;
  const text = room ? room.doc.getText(room.field) : null;
  const shared = Boolean(room?.canEdit);
  const ready = !room || room.synced;
  const editable = !readOnly && (!room || !room.canEdit || room.synced);

  /* ----------------------------------------- suggestions (§6, one list) */

  const preferCases = usePreferredCases();
  const preferCasesRef = useRef(preferCases);
  preferCasesRef.current = preferCases;
  const offerFiling = useMentionFiling();
  const offerFilingRef = useRef(offerFiling);
  offerFilingRef.current = offerFiling;
  const requestCreate = useRequestCreate();
  const creating = useRef(false);
  const [suggestState, setSuggestState] = useState<SuggestionRenderState | null>(null);

  const insertChip = useCallback(async (editor: Editor, entry: SuggestionEntry) => {
    // A handle first, from the archive — only an artikel this reader may see
    // gets one. Without an answer (offline) the name goes in as words.
    let handle: string | null = null;
    let chip: ShortChip | null = null;
    try {
      const response = await fetch('/api/mentions/handle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (response.ok) {
        const data = (await response.json()) as { handle?: string; chip?: ShortChip | null };
        handle = data.handle ?? null;
        chip = data.chip ?? null;
      }
    } catch {
      /* offline */
    }
    if (editor.isDestroyed) return;
    if (!handle) {
      editor.chain().focus().insertContent(`${entry.name} `).run();
      return;
    }
    const known: ShortChip = chip ?? { entryId: entry.id, name: entry.name, slug: entry.slug, icon: entry.typeIcon ?? null, colour: entry.typeColour ?? null };
    rememberChip(handle, known);
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'shortChip', attrs: { handle, name: known.name, slug: known.slug, icon: known.icon, colour: known.colour, hidden: false, known: true } },
        { type: 'text', text: ' ' },
      ])
      .run();
  }, []);

  const suggestions = useMemo(
    () =>
      Extension.create({
        name: 'shortSuggestions',
        addProseMirrorPlugins() {
          const host = {
            update: setSuggestState,
            requestCreate: async (name: string) => {
              creating.current = true;
              try {
                return await requestCreate(name);
              } finally {
                creating.current = false;
              }
            },
            preferCaseIds: () => preferCasesRef.current,
            onLinked: (entry: { id: string; name: string }, filed?: boolean) => offerFilingRef.current(entry, filed),
            insert: insertChip,
          };
          return [
            Suggestion({ editor: this.editor, pluginKey: AT_KEY, ...makeEntrySuggestion('@', host) }),
            Suggestion({ editor: this.editor, pluginKey: BRACKET_KEY, ...makeEntrySuggestion('[[', host) }),
          ];
        },
      }),
    [requestCreate, insertChip],
  );

  /* ------------------------------------------------ Enter, paste, blur */

  const keys = useMemo(
    () =>
      Extension.create({
        name: 'shortKeys',
        // Below the suggestion lists (100): an open list takes Enter first.
        priority: 50,
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor }) => {
              if (multiline) return editor.commands.setHardBreak();
              if (onEnterRef.current) onEnterRef.current();
              else (editor.view.dom as HTMLElement).blur();
              return true;
            },
            'Shift-Enter': ({ editor }) => (multiline ? editor.commands.setHardBreak() : true),
            'Mod-Enter': () => true,
          };
        },
      }),
    [multiline],
  );

  /* -------------------------------------------------------- the editor */

  const lastString = useRef(value);
  const initial = useMemo(
    () => ({ type: 'doc', content: toInline(room && room.synced && text ? text.toString() : value, multiline, page) }),
    // Read once: the editor holds its own document from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Memoised: `useEditor` compares its options on every render and re-applies
  // them when they differ, and a fresh object each keystroke would do that each
  // keystroke.
  const editorProps = useMemo<EditorProps>(
    () => ({
        attributes: {
          class: `${className} short-editor${multiline ? ' short-editor-multi' : ''}`,
          role: 'textbox',
          'aria-multiline': multiline ? 'true' : 'false',
          ...(id ? { id } : {}),
          ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
          ...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {}),
          ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
          ...(placeholder ? { 'aria-placeholder': placeholder, 'data-placeholder': placeholder } : {}),
          enterkeyhint: multiline ? 'enter' : 'done',
          autocapitalize: 'sentences',
          spellcheck: 'true',
          'data-short-box': 'true',
        },
        // §95: plakken wordt platte tekst — geen opmaak, geen plaatje, geen
        // handvat dat uit een ander vak meekwam; in een vak van één regel worden
        // regels spaties.
        handlePaste: (view, event) => {
          insertPlain(view, event.clipboardData?.getData('text/plain') ?? '', multiline);
          return true;
        },
        handleDOMEvents: {
          /*
           * Text that arrives in one piece with a line break in it — a
           * dictation, an autofill, a test's `fill` — goes the paste road: a
           * browser left to itself would split the line into blocks this
           * schema does not have, and ProseMirror would drop the break.
           */
          beforeinput: (view, event) => {
            const input = event as InputEvent;
            if (input.inputType !== 'insertText' && input.inputType !== 'insertReplacementText') return false;
            const data = input.data ?? input.dataTransfer?.getData('text/plain') ?? '';
            if (!/[\r\n\u27E6\u27E7]/.test(data)) return false;
            input.preventDefault();
            insertPlain(view, data, multiline);
            return true;
          },
        },
        handleDrop: () => true,
        // A plain left press on a chip walks to its artikel, like a chip in the
        // rich text (§68). Every other button is the browser's.
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          if (node.type.name !== 'shortChip' || !node.attrs.slug) return false;
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
          window.location.href = `/e/${node.attrs.slug}`;
          return true;
        },
      }),
    [className, multiline, id, ariaLabel, ariaLabelledBy, ariaDescribedBy, placeholder],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      ShortDoc,
      StarterKit.configure({
        document: false,
        paragraph: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        bold: false,
        italic: false,
        strike: false,
        code: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: multiline ? {} : false,
      }),
      ShortChipNode,
      suggestions,
      keys,
    ],
    content: initial,
    editorProps,
    onUpdate: ({ editor: current, transaction }) => {
      if (transaction.getMeta('shortRemote')) return;
      const next = serialise(current.state.doc);
      if (next === lastString.current) return;
      const before = lastString.current;
      lastString.current = next;
      const r = roomRef.current;
      if (r && r.canEdit && r.synced) {
        const yText = r.doc.getText(r.field);
        const delta = alignedDelta(yText.toString(), next);
        if (delta) {
          r.doc.transact(() => {
            if (delta.remove) yText.delete(delta.at, delta.remove);
            if (delta.insert) yText.insert(delta.at, delta.insert);
          }, origin);
        }
        return; // the observer below tells the parent
      }
      void before;
      onValueRef.current(next, { live: false });
    },
    onFocus: () => announce(true),
    onBlur: () => {
      announce(false);
      // §92 (A4): een `[[` zonder `]]` is geen vermelding. Niet terwijl het
      // maakblad open is dat die naam gaat maken, en niet als het venster zelf
      // de focus verloor (een andere app): wie terugkomt, typt verder.
      if (!creating.current && document.hasFocus() && editorRef.current?.isEditable) {
        const ed = editorRef.current;
        const now = serialise(ed.state.doc);
        const cleaned = dropDanglingOpeners(now);
        if (cleaned !== now) setString(ed, cleaned, false);
      }
      onBlurRef.current?.();
    },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  /** Replace the document's text with `next`, as one small step. `remote`: not ours, not undoable. */
  const setString = useCallback((ed: Editor, next: string, remote: boolean) => {
    const current = serialise(ed.state.doc);
    const delta = alignedDelta(current, next);
    if (!delta) return;
    const { state } = ed;
    const from = posAt(state.doc, delta.at);
    const to = posAt(state.doc, delta.at + delta.remove);
    const content = toInline(delta.insert, multiline, pageRef.current);
    const nodes = content.map((json) => state.schema.nodeFromJSON(json));
    const tr = state.tr.replaceWith(from, to, nodes);
    if (remote) {
      tr.setMeta('addToHistory', false);
      tr.setMeta('shortRemote', true);
      lastString.current = next;
    }
    ed.view.dispatch(tr);
  }, [multiline]);

  useEffect(() => {
    if (editor) {
      props.onMounted?.();
      props.onElement?.(editor.view.dom as HTMLElement);
      if (autoFocus) editor.commands.focus('end');
    }
    return () => props.onElement?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // The placeholder: a data attribute, because ProseMirror owns `class` and
  // rewrites it on every update. The CSS draws `data-placeholder` when empty.
  useEffect(() => {
    if (!editor) return;
    const mark = () => {
      const dom = editor.view.dom as HTMLElement;
      if (editor.state.doc.content.size === 0) dom.setAttribute('data-empty', 'true');
      else dom.removeAttribute('data-empty');
    };
    mark();
    editor.on('transaction', mark);
    return () => {
      editor.off('transaction', mark);
    };
  }, [editor]);

  /* ---------------------------------------- names, as they come back */

  useEffect(() => {
    if (!editor) return;
    const fill = () => {
      if (editor.isDestroyed) return;
      const { state } = editor;
      const tr = state.tr;
      state.doc.forEach((node, pos) => {
        if (node.type.name !== 'shortChip') return;
        const attrs = node.attrs as ChipAttrs;
        const next = chipAttrs(attrs.handle, pageRef.current);
        if (!next.known || (attrs.known && attrs.name === next.name && attrs.hidden === next.hidden && attrs.slug === next.slug)) return;
        tr.setNodeMarkup(pos, undefined, next);
      });
      if (tr.docChanged) {
        tr.setMeta('addToHistory', false);
        tr.setMeta('shortRemote', true);
        editor.view.dispatch(tr);
      }
    };
    const ask = () => {
      const unknown: string[] = [];
      editor.state.doc.forEach((node) => {
        if (node.type.name === 'shortChip' && !(node.attrs as ChipAttrs).known) unknown.push((node.attrs as ChipAttrs).handle);
      });
      fill();
      if (unknown.length) void requestChips(unknown).then(fill);
    };
    ask();
    editor.on('update', ask);
    return () => {
      editor.off('update', ask);
    };
  }, [editor, page]);

  /* ------------------------------------------------ the parent's copy */

  // Without a room — or before it has answered — the parent's `value` is the
  // truth, and a change to it that did not come from this box (a reset, a
  // prefill, a save that cleaned it) is put into the box.
  useEffect(() => {
    if (!editor || (shared && ready)) return;
    if (value === lastString.current) return;
    setString(editor, value, true);
    lastString.current = value;
  }, [editor, value, shared, ready, setString]);

  /* ------------------------------------------------------ the room (§21) */

  const binding = useRef(true);
  useEffect(() => {
    if (!editor || !room || !text) return;
    const onChange = (_event: Y.YTextEvent, transaction: Y.Transaction) => {
      const next = text.toString();
      if (transaction.origin !== origin && next !== serialise(editor.state.doc)) setString(editor, next, true);
      lastString.current = next;
      onValueRef.current(next, { live: room.canEdit });
    };
    text.observe(onChange);
    // §25: the handover, exactly as `BoundField` makes it.
    const now = text.toString();
    const first = binding.current && room.synced;
    if (room.synced) binding.current = false;
    if (first && room.canEdit && !now && lastString.current) {
      const seed = lastString.current;
      room.doc.transact(() => text.insert(0, seed), origin);
    } else if (room.synced && now !== serialise(editor.state.doc)) {
      setString(editor, now, true);
      lastString.current = now;
      onValueRef.current(now, { live: room.canEdit });
    }
    return () => text.unobserve(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, text, room?.doc, room?.canEdit, room?.synced, origin]);

  /* ------------------------------------------- who else is typing here */

  const [typist, setTypist] = useState<{ name: string; colour: string } | null>(null);
  const announce = (focused: boolean) => {
    const r = roomRef.current;
    if (!r) return;
    const current = (r.awareness.getLocalState() ?? {}) as Record<string, unknown>;
    if (!current.user) return;
    r.awareness.setLocalState({ ...current, field: focused ? r.field : null });
  };
  useEffect(() => {
    if (!room) return;
    const { awareness, doc, field } = room;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.awareness, room?.doc, room?.field]);

  const style = typist ? ({ ['--field-colour' as string]: typist.colour } as React.CSSProperties) : undefined;
  return (
    <span className={`live-field short-field${typist ? ' live-field-busy' : ''}`} style={style}>
      <EditorContent editor={editor} />
      {typist && <span className="live-field-tag">{typist.name}</span>}
      {/* §95: the short boxes' list, under the name it had in §27 (`mention-pop`). */}
      <SuggestionPopup state={suggestState} testId="mention-pop" />
    </span>
  );
}

/** For tests: the handles a box currently holds, in order. */
export function shortHandles(text: string): string[] {
  return handlesIn(text);
}

export { OPEN as SHORT_OPEN, CLOSE as SHORT_CLOSE };
