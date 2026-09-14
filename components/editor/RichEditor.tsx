'use client';

import { Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { Icon } from '@/components/Icon';
import { useUi } from '@/components/ui/UiProvider';
import { usePreferredCases } from '@/components/entry/PreferredCases';
import { documentExtensions } from '@/lib/editor/extensions';
import { useMentionFiling } from '@/components/cases/useMentionFiling';
import { makeEntrySuggestion, type SuggestionEntry, type SuggestionRenderState } from './entrySuggestion';
import { SuggestionPopup } from './SuggestionPopup';
import type { LiveUser } from './useLiveDoc';
import { useAuthorGate, useMayType } from '@/components/you/AuthorProvider';
import { fitUpload } from '@/components/shrinkImage';
import { imageFromClipboard, uploadForm, SHRUNK_NOTICE } from '@/lib/upload';

/**
 * §20: when the text is a room, the editor binds to the shared Yjs document
 * instead of holding its own copy. Nothing is autosaved from here — the room
 * writes itself to the archive — and undo is Yjs's, which undoes *your*
 * keystrokes and leaves everyone else's alone.
 */
export type LiveBinding = {
  doc: Y.Doc;
  provider: { awareness: Awareness };
  user: LiveUser;
};

const AT_KEY = new PluginKey('entrySuggestionAt');
const BRACKET_KEY = new PluginKey('entrySuggestionBrackets');

type ToolbarButtonProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
};

function ToolbarButton({ label, active, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Whether a press on a reference asks for a *second* place to read in.
 *
 * A plain left click on a chip is the archive's: it walks you to the artikel in
 * the tab you are already reading in, which is what a wiki does and what this
 * has always done. Ctrl or cmd asks for a tab, shift for a window, alt for a
 * saved copy — and not one of those may be answered by taking the tab the
 * reader is standing in.
 *
 * The two must diverge, because handling them alike was the first half of this
 * bug: a chip whose click was `window.location.href` took the tab you were
 * standing in with it however you pressed, so ctrl+click *lost* the page you
 * were reading instead of opening a second one.
 *
 * §68: the **button** is deliberately not asked here any more — `mineToAnswer`
 * is where that question belongs, and the difference is the other half of the
 * bug. See it for why.
 */
function opensElsewhere(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * §68: whether this press is the archive's to answer at all.
 *
 * **Only the left button is ever ours.** ProseMirror does not hand
 * `handleClickOn` a `click`: it opens a `MouseDown` on the way down and asks on
 * the way *up*, from `mouseup` — and `mouseup` fires for every button there is.
 * So the middle button and the **right** button both arrived at a handler that
 * had been written as though only a left one could, and `opensElsewhere` said
 * yes to both because it read `button !== 0`. The middle button therefore
 * opened a tab *twice* — once from `auxclick` below and once from this, which
 * is why one of the two was swallowed by the popup blocker — and a right click
 * opened the artikel in a tab instead of putting the browser's own menu up,
 * which is the one thing a right click on a link anywhere means.
 *
 * A chip is a real `<a href>` (see `EntryLink`), and a browser already knows
 * every one of these gestures. So the rule is the smallest one that works: the
 * left button is the archive's, every other button is the browser's, and we
 * neither answer nor cancel it.
 */
function mineToAnswer(event: MouseEvent) {
  return event.button === 0;
}

/** The chip under the pointer, for the events ProseMirror hands us raw. */
function chipSlugAt(target: EventTarget | null) {
  const chip = (target as HTMLElement | null)?.closest?.('a[data-entry-slug]');
  return chip?.getAttribute('data-entry-slug') || null;
}

export function RichEditor({
  initialDoc,
  placeholder = 'Schrijf op wat er gebeurd is…',
  onChange,
  editable: allowed = true,
  live,
}: {
  initialDoc: unknown;
  placeholder?: string;
  onChange: (doc: unknown) => void;
  editable?: boolean;
  /** §20: bind to a room instead of `initialDoc`. Fixed for the editor's life. */
  live?: LiveBinding | null;
}) {
  const ui = useUi();
  /*
   * §18b: a speler with no onderzoeker has nothing the archive would accept a
   * word under, so the caret is not offered — and the first touch of anyone
   * who has not yet said who they are writing as asks the question.
   */
  const mayType = useMayType();
  const gate = useAuthorGate();
  const editable = allowed && mayType;
  /*
   * §31: the dossiers this text lives in, so `@` and `[[` offer what is
   * already in them first. Held in a ref because the two Suggestion plugins are
   * built once, when the editor is created, and would otherwise close over the
   * list as it was at that moment.
   */
  const preferCases = usePreferredCases();
  const preferCasesRef = useRef(preferCases);
  preferCasesRef.current = preferCases;

  const [suggestState, setSuggestState] = useState<SuggestionRenderState | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef('');
  const ready = useRef(false);

  /*
   * §48: the dossier this text belongs to, when the text *is* a dossier's.
   * Two things hang off it: the sheet the `@` opens is opened inside that
   * dossier — which is the only way a voorwerp or an aanwijzing can be made at
   * all (§24) — and every name that lands in the text is offered a place on its
   * shelves. `caseHere` is null everywhere but a dossier's own page, so an
   * artikel's body, a kaart's text and a gebeurtenis behave exactly as before.
   */
  const here = ui.caseHere;
  // Through a ref: the two Suggestion plugins are built once, when the editor
  // is created, exactly as `preferCases` above is and for the same reason.
  const offerFiling = useMentionFiling();
  const offerFilingRef = useRef(offerFiling);
  offerFilingRef.current = offerFiling;

  /** Opens the New entry sheet and resolves with the created entry. */
  const requestCreate = useCallback(
    (name: string) =>
      new Promise<SuggestionEntry | null>((resolve) => {
        let settled = false;
        ui.openNewEntry({
          name,
          caseId: here?.id,
          // §49: made from the dossier's own writing is made *in* the dossier,
          // and therefore filed in it — the sheet has no question about that
          // left to ask. What it does ask is whether the dossier's name goes in
          // front of the new artikel's.
          onCreated: (entry) => {
            settled = true;
            resolve({
              id: entry.id,
              slug: entry.slug,
              name: entry.name,
              shortDescription: entry.shortDescription,
              typeSlug: entry.typeSlug,
              typeLabel: entry.typeLabel,
              typeIcon: entry.typeIcon,
              typeColour: entry.typeColour,
              // §48: whether the sheet already put it in the dossier, so the
              // question is not asked a second time.
              filed: entry.filed,
            });
          },
        });
        // If the sheet is dismissed the promise would hang; give it a bounded
        // life so the editor never ends up waiting forever.
        const check = setInterval(() => {
          if (settled) {
            clearInterval(check);
            return;
          }
          if (!document.querySelector('.sheet-backdrop')) {
            clearInterval(check);
            resolve(null);
          }
        }, 400);
      }),
    [ui, here],
  );

  const suggestionExtension = useMemo(
    () =>
      Extension.create({
        name: 'entrySuggestions',
        addProseMirrorPlugins() {
          const host = {
            update: setSuggestState,
            requestCreate,
            preferCaseIds: () => preferCasesRef.current,
            // §48: whatever ends up in the text — picked or just made — is
            // offered a place in the dossier this text belongs to.
            onLinked: (entry: { id: string; name: string }, filed?: boolean) =>
              offerFilingRef.current(entry, filed),
          };
          // Each Suggestion instance needs its own plugin key, or ProseMirror
          // refuses the second one ("different instances of a keyed plugin").
          return [
            Suggestion({
              editor: this.editor,
              pluginKey: AT_KEY,
              ...makeEntrySuggestion('@', host),
            }),
            Suggestion({
              editor: this.editor,
              pluginKey: BRACKET_KEY,
              ...makeEntrySuggestion('[[', host),
            }),
          ];
        },
      }),
    [requestCreate],
  );

  // Read once: an editor is either shared or its own for as long as it exists.
  const liveRef = useRef(live ?? null);
  const binding = liveRef.current;

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      ...documentExtensions({ history: binding ? false : undefined }),
      Placeholder.configure({ placeholder }),
      suggestionExtension,
      ...(binding
        ? [
            Collaboration.configure({ document: binding.doc, field: 'default' }),
            CollaborationCursor.configure({
              provider: binding.provider,
              user: { name: binding.user.name, color: binding.user.colour },
            }),
          ]
        : []),
    ],
    // A shared document already has its text; giving Tiptap content as well
    // would insert it a second time.
    ...(binding ? {} : { content: (initialDoc as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] } }),
    editorProps: {
      attributes: { class: 'prose' },
      /*
       * Clicking a chip while editing should still take you to the entry — and
       * a chip is a reference, so it owes the reader everything a hyperlink
       * owes them.
       *
       * `window.location.href` rather than letting the anchor follow itself,
       * because this surface is a contenteditable for most of its life and a
       * browser does not reliably follow a link the caret is allowed to sit in.
       * So the walk is taken by hand, and `return true` tells ProseMirror the
       * press is answered — otherwise it would also put the caret on the chip.
       *
       * §68: and this is now the *plain left press only*. ProseMirror asks this
       * from `mouseup`, which every button fires (see `mineToAnswer`), so a
       * press this handler is not sure of is given back rather than answered:
       * the middle and the right button below, and a modified left press to the
       * `click` handler, where a `preventDefault` still means something.
       */
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== 'entryLink' || !node.attrs.slug) return false;
        if (!mineToAnswer(event) || opensElsewhere(event)) return false;
        window.location.href = `/e/${node.attrs.slug}`;
        return true;
      },
      handleDOMEvents: {
        /*
         * §68: a left press with ctrl, cmd, shift or alt down — a second tab, a
         * window, a saved copy.
         *
         * It is answered *here* rather than in `handleClickOn` for one reason:
         * `handleClickOn` runs on `mouseup`, and `preventDefault` on a mouseup
         * cancels nothing a link does. So opening a tab by hand up there left
         * the browser free to follow the anchor as well and the reader got two.
         * On `click` the cancel bites, so exactly one tab opens — and it is
         * opened by hand, for the contenteditable reason above.
         */
        click: (_view, event) => {
          if (!mineToAnswer(event) || !opensElsewhere(event)) return false;
          const slug = chipSlugAt(event.target);
          if (!slug) return false;
          event.preventDefault();
          window.open(`/e/${slug}`, '_blank', 'noopener');
          return true;
        },
        /*
         * The middle button never reaches `handleClickOn` as itself: a browser
         * reports it as `auxclick`. So the chip is found the other way round,
         * from the element under the pointer, and opened by hand.
         *
         * `preventDefault` earns its place twice over here — it stops the
         * middle button from pasting the X11 primary selection into the prose,
         * which is what that button means inside a contenteditable, and it
         * stops a browser from reading the press as the start of an autoscroll.
         *
         * §68: this was never the whole of the middle button, and that was the
         * bug. Its `mouseup` reached `handleClickOn` too, which opened a second
         * tab — see `mineToAnswer`. This one is the whole of it now.
         *
         * Right-click is deliberately not handled at all, here or anywhere
         * else in this file. The chip is a real `<a>` with a real href (see
         * `EntryLink`), so the browser's own menu already offers to open it on
         * a new tab; swallowing `contextmenu` is the one way to lose that — and
         * so, it turns out, is answering its `mouseup`.
         */
        auxclick: (_view, event) => {
          if (event.button !== 1) return false;
          const slug = chipSlugAt(event.target);
          if (!slug) return false;
          event.preventDefault();
          window.open(`/e/${slug}`, '_blank', 'noopener');
          return true;
        },
      },
      /*
       * §30: a picture on the clipboard becomes a picture in the prose. This
       * read `clipboardData.files[0]` and nothing else, which is the one shape
       * a *screenshot* never has — so pasting a screenshot into an artikel did
       * nothing at all. `imageFromClipboard` reads both shapes and names the
       * nameless one.
       *
       * Returning false is what keeps prose working: everything that is not a
       * picture — text, HTML, a whole pasted article — falls straight through
       * to Tiptap and is handled exactly as it was before.
       */
      handlePaste: (_view, event) => {
        const file = imageFromClipboard(event);
        if (!file) return false;
        event.preventDefault();
        void uploadImage(file);
        return true;
      },
    },
    onCreate: ({ editor: instance }) => {
      // Tiptap normalises the loaded document on mount, which counts as an
      // update. Taking that as a change would autosave — and write a revision —
      // every time someone merely opened an entry, so the baseline is captured
      // here and everything before it is ignored.
      lastEmitted.current = JSON.stringify(instance.getJSON());
      ready.current = true;
    },
    onUpdate: ({ editor: instance }) => {
      // The room saves itself; a shared editor has nothing to report upward.
      if (!ready.current || binding) return;
      const next = JSON.stringify(instance.getJSON());
      if (next === lastEmitted.current) return;
      lastEmitted.current = next;
      onChangeRef.current(instance.getJSON());
    },
  });

  const uploadImage = useCallback(
    async (file: File) => {
      if (!editor) return;
      // §30: a picture over the ceiling is shrunk to fit, not turned away.
      const fitted = await fitUpload(file, ui.uploadLimit);
      if ('error' in fitted) {
        ui.toast(fitted.error);
        return;
      }
      if (fitted.shrunk) ui.toast(SHRUNK_NOTICE);
      const form = new FormData();
      form.append('file', fitted.file);
      const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
      if (!result.ok) {
        ui.toast(result.error);
        return;
      }
      editor.chain().focus().setImage({ src: `/api/assets/${result.data.asset.id}`, alt: fitted.file.name }).run();
    },
    [editor, ui],
  );

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) {
    return <div className="editor-body" aria-busy="true" />;
  }

  return (
    <div {...gate}>
      {editable && (
        <div className="editor-toolbar">
          <ToolbarButton
            label="Vet"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            label="Cursief"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            label="Kop"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H
          </ToolbarButton>
          <ToolbarButton
            label="Opsomming"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            &bull;
          </ToolbarButton>
          <ToolbarButton
            label="Genummerde lijst"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            label="Citaat"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            &rdquo;
          </ToolbarButton>
          <ToolbarButton
            label="Koppeling"
            active={editor.isActive('link')}
            onClick={() => {
              setLinkValue((editor.getAttributes('link').href as string) ?? 'https://');
              setLinkOpen((open) => !open);
            }}
          >
            <Icon name="link" size={16} />
          </ToolbarButton>
          <ToolbarButton label="Afbeelding" onClick={() => fileRef.current?.click()}>
            <Icon name="camera" size={16} />
          </ToolbarButton>
          <span className="spacer" />
          <span className="tiny muted" style={{ alignSelf: 'center', paddingRight: '0.3rem' }}>
            @ of [[ om te koppelen · of plak een afbeelding
          </span>
        </div>
      )}

      {linkOpen && (
        <div className="row" style={{ padding: '0.4rem', border: '1px solid var(--rule)', borderTop: 'none' }}>
          <input
            className="input"
            value={linkValue}
            autoFocus
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                const href = linkValue.trim();
                if (href && href !== 'https://') {
                  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
                } else {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                }
                setLinkOpen(false);
              } else if (event.key === 'Escape') {
                setLinkOpen(false);
              }
            }}
            placeholder="https://…"
          />
          <button className="btn btn-small" type="button" onClick={() => setLinkOpen(false)}>
            Klaar
          </button>
        </div>
      )}

      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadImage(file);
        }}
      />

      <SuggestionPopup state={suggestState} />
    </div>
  );
}
