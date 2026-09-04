import type { Editor, Range } from '@tiptap/core';
import type { SuggestionOptions } from '@tiptap/suggestion';

export type SuggestionEntry = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  typeSlug: string;
  typeLabel: string;
  typeIcon: string;
  typeColour: string;
};

export type SuggestionItem =
  | { kind: 'entry'; entry: SuggestionEntry }
  /** §6: the last item is always "Create '<typed>'". */
  | { kind: 'create'; name: string };

export type SuggestionRenderState = {
  items: SuggestionItem[];
  activeIndex: number;
  rect: DOMRect | null;
  onPick: (index: number) => void;
};

type Host = {
  /** Called on every keystroke so the React layer can draw the popup. */
  update: (state: SuggestionRenderState | null) => void;
  /** Opens the New entry sheet, resolving to the created entry or null. */
  requestCreate: (name: string) => Promise<SuggestionEntry | null>;
};

function insertEntry(editor: Editor, range: Range, entry: SuggestionEntry) {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: 'entryLink',
        attrs: {
          id: entry.id,
          label: entry.name,
          slug: entry.slug,
          icon: entry.typeIcon,
          colour: entry.typeColour,
        },
      },
      { type: 'text', text: ' ' },
    ])
    .run();
}

/**
 * Shared behaviour for the `@` and `[[` triggers. Both produce the same list
 * and the same chip; only the character differs (§6).
 */
export function makeEntrySuggestion(char: string, host: Host): Omit<SuggestionOptions, 'editor'> {
  return {
    char,
    startOfLine: false,
    allowSpaces: true,
    // Stop matching once the query gets long enough to be a sentence.
    allow: ({ state, range }) => {
      const text = state.doc.textBetween(range.from, range.to, '\0');
      return text.length <= 60;
    },

    items: async ({ query }): Promise<SuggestionItem[]> => {
      const typed = query.trim();
      const items: SuggestionItem[] = [];
      if (typed.length >= 1) {
        try {
          const response = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}&limit=6`);
          if (response.ok) {
            const data = (await response.json()) as { entries: SuggestionEntry[] };
            for (const entry of data.entries ?? []) items.push({ kind: 'entry', entry });
          }
        } catch {
          /* offline: the create option still works */
        }
      }
      if (typed.length >= 1) items.push({ kind: 'create', name: typed });
      return items;
    },

    render: () => {
      let items: SuggestionItem[] = [];
      let activeIndex = 0;
      let currentEditor: Editor | null = null;
      let currentRange: Range | null = null;
      let rect: DOMRect | null = null;

      const pick = async (index: number) => {
        const item = items[index];
        if (!item || !currentEditor || !currentRange) return;
        const editor = currentEditor;
        const range = currentRange;

        if (item.kind === 'entry') {
          insertEntry(editor, range, item.entry);
          host.update(null);
          return;
        }

        // "Create '<typed>'" — drop the trigger text first so the sheet is not
        // fighting a half-typed token, then insert the chip when it comes back.
        editor.chain().focus().deleteRange(range).run();
        host.update(null);
        const created = await host.requestCreate(item.name);
        if (created) {
          editor
            .chain()
            .focus()
            .insertContent([
              {
                type: 'entryLink',
                attrs: {
                  id: created.id,
                  label: created.name,
                  slug: created.slug,
                  icon: created.typeIcon,
                  colour: created.typeColour,
                },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        }
      };

      const draw = () => {
        host.update({ items, activeIndex, rect, onPick: (index) => void pick(index) });
      };

      return {
        onStart: (props) => {
          items = props.items as SuggestionItem[];
          activeIndex = 0;
          currentEditor = props.editor;
          currentRange = props.range;
          rect = props.clientRect?.() ?? null;
          draw();
        },
        onUpdate: (props) => {
          items = props.items as SuggestionItem[];
          currentEditor = props.editor;
          currentRange = props.range;
          rect = props.clientRect?.() ?? null;
          if (activeIndex >= items.length) activeIndex = Math.max(0, items.length - 1);
          draw();
        },
        onKeyDown: (props) => {
          if (!items.length) return false;
          if (props.event.key === 'ArrowDown') {
            activeIndex = (activeIndex + 1) % items.length;
            draw();
            return true;
          }
          if (props.event.key === 'ArrowUp') {
            activeIndex = (activeIndex - 1 + items.length) % items.length;
            draw();
            return true;
          }
          if (props.event.key === 'Enter' || props.event.key === 'Tab') {
            void pick(activeIndex);
            return true;
          }
          if (props.event.key === 'Escape') {
            host.update(null);
            return true;
          }
          return false;
        },
        onExit: () => {
          host.update(null);
        },
      };
    },
  };
}
