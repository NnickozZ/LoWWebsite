import { mergeAttributes, Node } from '@tiptap/core';
import { isHandle } from '@/lib/entries/shortTokens.mjs';

/**
 * §97: what one reference is on this reader's screen, and where to ask when it
 * is not known yet. The rich editor hands this in (`documentExtensions({ chips
 * })`); the server builds the schema without it, and a schema needs none.
 */
export type EntryLinkChip = { entryId: string; name: string; slug: string; icon: string | null; colour: string | null };
export type EntryLinkChips = {
  /** `undefined`: still on its way. `null`: nothing to draw. */
  known: (handle: string) => EntryLinkChip | null | undefined;
  /** Ask for these (batched); resolves once they are known. */
  request: (handles: string[]) => Promise<void>;
  /** Called again whenever the page's answer changes (a refresh after a rename). */
  subscribe?: (repaint: () => void) => () => void;
};

export type EntryLinkAttrs = { handle: string };

/**
 * An inline atom that stands for one wiki entry.
 *
 * §97, round 58: it carries a **handle** and nothing else — the same handle a
 * short text carries since §95 (`mention_handles`). Until this round it carried
 * the artikel's id, name, slug, icon and colour, and so the running text, its
 * Yjs room, the page payload and every revision told everybody who could read
 * the text what it linked to, even when that artikel was hidden from them.
 * Now the name is looked up per reader (`resolveHandles` on the server, the
 * page's `ShortChips` map and `/api/mentions` in the browser), and a handle the
 * reader may not follow draws **nothing**: no grey chip, no name, no gap.
 *
 * Nothing the reader learns goes back into the node: a node's attributes are
 * what y-prosemirror writes into the shared document, and a name there would
 * be in everybody's room again. The name lives in the node *view* only.
 */
export const EntryLink = Node.create<{ chips: EntryLinkChips | null }>({
  name: 'entryLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { chips: null };
  },

  addAttributes() {
    // renderHTML: () => ({}) because renderHTML below writes the element by hand.
    return {
      handle: { default: '', renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-entry-handle]',
        getAttrs: (element) => {
          const handle = (element as HTMLElement).getAttribute('data-entry-handle');
          return isHandle(handle) ? { handle } : false;
        },
      },
    ];
  },

  /*
   * What a copy puts on the clipboard, and `getHTML()`: the handle, and the
   * name only when this reader knows it. A paste into another text of this
   * archive is the same reference again; the server checks it (`cleanDocRefs`).
   */
  renderHTML({ node, HTMLAttributes }) {
    const handle = (node.attrs as EntryLinkAttrs).handle;
    const chip = this.options.chips?.known(handle) ?? null;
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: chip ? 'entry-chip' : 'entry-chip-none',
        'data-entry-handle': handle,
        ...(chip ? { href: `/e/${chip.slug}`, 'data-entry-slug': chip.slug } : {}),
      }),
      chip ? chip.name : '',
    ];
  },

  renderText({ node }) {
    return this.options.chips?.known((node.attrs as EntryLinkAttrs).handle)?.name ?? '';
  },

  addNodeView() {
    // Without a source there is nobody to ask: every reference is nothing to draw.
    const chips: EntryLinkChips = this.options.chips ?? { known: () => null, request: async () => undefined };
    return ({ node }) => {
      let handle = (node.attrs as EntryLinkAttrs).handle;
      const dom = document.createElement('a');
      dom.setAttribute('contenteditable', 'false');
      dom.setAttribute('data-entry-handle', handle);
      let alive = true;
      // Asked once per handle: offline, an answer that never comes is not asked for in a loop.
      let asked = '';

      const paint = () => {
        if (!alive) return;
        const chip = chips.known(handle);
        if (chip) {
          dom.className = 'entry-chip';
          dom.textContent = chip.name;
          dom.setAttribute('href', `/e/${chip.slug}`);
          dom.setAttribute('data-entry-slug', chip.slug);
          dom.setAttribute('data-entry-icon', chip.icon ?? '');
          // The hover card (`EntryPreview`) reads this; only a chip this reader may follow has one.
          dom.setAttribute('data-entry-id', chip.entryId);
          // §89: only six hex digits ever reach a style attribute.
          if (chip.colour && /^#[0-9a-fA-F]{6}$/.test(chip.colour)) dom.style.setProperty('--chip-colour', chip.colour);
          else dom.style.removeProperty('--chip-colour');
          dom.removeAttribute('aria-hidden');
          return;
        }
        // Nothing to draw (or not yet): an empty place in the line, and no name.
        dom.className = 'entry-chip-none';
        dom.textContent = '';
        dom.removeAttribute('href');
        dom.removeAttribute('data-entry-slug');
        dom.removeAttribute('data-entry-icon');
        dom.removeAttribute('data-entry-id');
        dom.style.removeProperty('--chip-colour');
        dom.setAttribute('aria-hidden', 'true');
        if (chip === undefined && asked !== handle) {
          asked = handle;
          void chips.request([handle]).then(paint);
        }
      };
      paint();
      const unsubscribe = chips.subscribe?.(paint);

      return {
        dom,
        update: (next) => {
          if (next.type.name !== 'entryLink') return false;
          const nextHandle = (next.attrs as EntryLinkAttrs).handle;
          if (nextHandle !== handle) {
            handle = nextHandle;
            dom.setAttribute('data-entry-handle', handle);
          }
          paint();
          return true;
        },
        ignoreMutation: () => true,
        destroy: () => {
          alive = false;
          unsubscribe?.();
        },
      };
    };
  },
});
