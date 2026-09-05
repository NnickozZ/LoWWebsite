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
import { documentExtensions } from '@/lib/editor/extensions';
import { makeEntrySuggestion, type SuggestionEntry, type SuggestionRenderState } from './entrySuggestion';
import { SuggestionPopup } from './SuggestionPopup';
import type { LiveUser } from './useLiveDoc';
import { uploadForm } from '@/lib/upload';

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

export function RichEditor({
  initialDoc,
  placeholder = 'Schrijf op wat er gebeurd is…',
  onChange,
  editable = true,
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
  const [suggestState, setSuggestState] = useState<SuggestionRenderState | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitted = useRef('');
  const ready = useRef(false);

  /** Opens the New entry sheet and resolves with the created entry. */
  const requestCreate = useCallback(
    (name: string) =>
      new Promise<SuggestionEntry | null>((resolve) => {
        let settled = false;
        ui.openNewEntry({
          name,
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
    [ui],
  );

  const suggestionExtension = useMemo(
    () =>
      Extension.create({
        name: 'entrySuggestions',
        addProseMirrorPlugins() {
          const host = { update: setSuggestState, requestCreate };
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
      handleClickOn: (_view, _pos, node) => {
        // Clicking a chip while editing should still take you to the entry.
        if (node.type.name === 'entryLink' && node.attrs.slug) {
          window.location.href = `/e/${node.attrs.slug}`;
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const file = Array.from(event.clipboardData?.files ?? [])[0];
        if (!file || !file.type.startsWith('image/')) return false;
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
      const form = new FormData();
      form.append('file', file);
      const result = await uploadForm<{ asset: { id: string } }>('/api/assets', form);
      if (!result.ok) {
        ui.toast(result.error);
        return;
      }
      editor.chain().focus().setImage({ src: `/api/assets/${result.data.asset.id}`, alt: file.name }).run();
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
    <div>
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
            @ of [[ om te koppelen
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
