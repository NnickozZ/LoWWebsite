import { mergeAttributes, Node } from '@tiptap/core';

export type EntryLinkAttrs = {
  id: string;
  label: string;
  slug: string;
  icon?: string | null;
  colour?: string | null;
};

/**
 * An inline atom that stands for one wiki entry. It carries the label and slug
 * so the document renders correctly on its own, and the id so `entry_links`
 * (and therefore backlinks) can be recomputed from the document alone.
 */
export const EntryLink = Node.create({
  name: 'entryLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    // renderHTML: () => ({}) on each, because renderHTML below writes the real
    // attributes by hand. Without this Tiptap would also spill `id`, `label`,
    // `slug` and `colour` onto the <a> as bogus HTML attributes — and a
    // duplicated `id` breaks every id-based query on the page.
    return {
      id: { default: '', renderHTML: () => ({}) },
      label: { default: '', renderHTML: () => ({}) },
      slug: { default: '', renderHTML: () => ({}) },
      icon: { default: null, renderHTML: () => ({}) },
      colour: { default: null, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-entry-id]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            id: el.getAttribute('data-entry-id') ?? '',
            label: el.textContent ?? '',
            slug: el.getAttribute('data-entry-slug') ?? '',
            icon: el.getAttribute('data-entry-icon'),
            colour: el.getAttribute('data-entry-colour'),
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as EntryLinkAttrs;
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        class: 'entry-chip',
        href: attrs.slug ? `/e/${attrs.slug}` : '#',
        'data-entry-id': attrs.id,
        'data-entry-slug': attrs.slug,
        'data-entry-icon': attrs.icon ?? '',
        'data-entry-colour': attrs.colour ?? '',
        style: attrs.colour ? `--chip-colour:${attrs.colour}` : undefined,
      }),
      attrs.label || 'entry',
    ];
  },

  renderText({ node }) {
    return (node.attrs as EntryLinkAttrs).label ?? '';
  },
});
