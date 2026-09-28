import { mergeAttributes, Node } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { isHandle } from '@/lib/entries/shortTokens.mjs';
import { naadHoofd, naadSneden, type NaadStuk } from '@/lib/wiki/naad';

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

  /*
   * §97/§104 (ronde 67·herstel): the words around a reference this reader may
   * not follow close up while reading — no space before a comma, none at the
   * start of a paragraph, never two (`lib/wiki/naad.ts`). Only a decoration:
   * the document, which the room shares and the Keeper reads with the name in
   * it, is not touched.
   */
  addProseMirrorPlugins() {
    const chips = this.options.chips;
    return [
      naadPlugin((node) => {
        if (node.type.name !== 'entryLink') return null;
        return chips?.known((node.attrs as EntryLinkAttrs).handle) ? 'vast' : 'verborgen';
      }, chips?.subscribe),
    ];
  },

  addNodeView() {
    // Without a source there is nobody to ask: every reference is nothing to draw.
    const chips: EntryLinkChips = this.options.chips ?? { known: () => null, request: async () => undefined };
    return ({ node, view }) => {
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
          void chips.request([handle]).then(() => {
            paint();
            // The answer may turn nothing into a name: the seams are measured again.
            nudgeNaad(view);
          });
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

/* ------------------------------------------------------------- de naad */

const NAAD_KEY = new PluginKey<DecorationSet>('entryLinkNaad');
const nudgers = new WeakMap<EditorView, () => void>();

/** Ask the seams of this editor to be measured again (a chip's name arrived). */
export function nudgeNaad(view: EditorView | null | undefined) {
  if (view) nudgers.get(view)?.();
}

/** What an inline node is for the seam: hidden (nothing to draw), solid (a word), or `null` (ask the default). */
export type NaadKind = (node: PmNode) => 'verborgen' | 'vast' | null;

/** The decorations that hide the stray spaces and stops around every hidden reference in `doc`. */
export function naadDecorations(doc: PmNode, kind: NaadKind): DecorationSet {
  const decorations: Decoration[] = [];
  const block = (node: PmNode, start: number) => {
    const pieces: NaadStuk[] = [];
    const where: number[] = [];
    let hidden = false;
    node.forEach((child, offset) => {
      where.push(start + offset);
      if (child.isText) pieces.push({ tekst: child.text ?? '' });
      else if (child.type.name === 'hardBreak') pieces.push({ breuk: true });
      else {
        const said = kind(child);
        if (said === 'verborgen') hidden = true;
        pieces.push(said === 'verborgen' ? { verborgen: true } : { vast: true });
      }
    });
    if (!hidden) return;
    const sneden = naadSneden(pieces);
    sneden.forEach((cuts, index) => {
      for (const [a, b] of cuts) {
        decorations.push(Decoration.inline(where[index] + a, where[index] + b, { class: 'naad' }));
      }
    });
    // §104 (golf H, D28): a paragraph that now begins after a hidden name begins with a capital — in the drawing only.
    const hoofd = naadHoofd(pieces, sneden);
    if (hoofd) {
      decorations.push(
        Decoration.inline(where[hoofd.stuk] + hoofd.van, where[hoofd.stuk] + hoofd.tot, { class: 'naad-hoofd' }),
      );
    }
  };
  if (doc.inlineContent) block(doc, 0);
  else {
    doc.descendants((node, pos) => {
      if (!node.inlineContent) return true;
      block(node, pos + 1);
      return false;
    });
  }
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/**
 * The plugin both editors carry: measured on every change of the document and
 * whenever a chip's answer arrives (`subscribe`, `nudgeNaad`). The class hides
 * the character only while the editor is read-only (`app/leeskamer.css`): in
 * Bewerken you type into the text as it is stored.
 */
export function naadPlugin(kind: NaadKind, subscribe?: (repaint: () => void) => () => void): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: NAAD_KEY,
    state: {
      init: (_config, state) => naadDecorations(state.doc, kind),
      apply: (tr, old) => (tr.docChanged || tr.getMeta(NAAD_KEY) ? naadDecorations(tr.doc, kind) : old),
    },
    props: {
      decorations: (state) => NAAD_KEY.getState(state),
    },
    view: (view) => {
      let alive = true;
      let queued = false;
      const nudge = () => {
        if (queued || !alive) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (alive) view.dispatch(view.state.tr.setMeta(NAAD_KEY, true));
        });
      };
      nudgers.set(view, nudge);
      const unsubscribe = subscribe?.(nudge);
      return {
        destroy: () => {
          alive = false;
          nudgers.delete(view);
          unsubscribe?.();
        },
      };
    },
  });
}
