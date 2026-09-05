import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';
import { EntryLink } from '@/components/editor/EntryLink';

/**
 * What a fiche's text is made of — the one list both halves read.
 *
 * The browser builds its editor from it; the server builds the *schema* from
 * it (`lib/live/schema.ts`) to turn a stored ProseMirror document into a Yjs
 * one and back. They have to be the same list: a node the server does not
 * know is a node the shared document cannot carry, and a mismatch would only
 * show up as text silently missing after a reload.
 *
 * Deliberately schema-only: the placeholder, the @ / [[ suggestions and the
 * collaboration extensions are behaviour, and `RichEditor` adds them itself.
 * `history: false` is for the shared editor, where Yjs keeps the undo stack
 * (undoing someone else's keystrokes is not undo).
 */
export function documentExtensions(options: { history?: boolean } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      ...(options.history === false ? { history: false as const } : {}),
    }),
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noreferrer' } }),
    Image.configure({ inline: false, allowBase64: false }),
    EntryLink,
  ];
}
