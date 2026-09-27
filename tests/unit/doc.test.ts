import { describe, expect, it } from 'vitest';
import { docExcerpt, docToText, extractEntryLinks, isEmptyDoc } from '@/lib/entries/doc';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The light at ' },
        {
          type: 'entryLink',
          attrs: { id: 'abc123', label: 'Westkapelle Lighthouse', slug: 'westkapelle-lighthouse' },
        },
        { type: 'text', text: ' has not been wound.' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Ask ' },
        { type: 'entryLink', attrs: { id: 'def456', label: 'Jacob den Hollander', slug: 'jacob' } },
        { type: 'text', text: ' about it. Then ask ' },
        { type: 'entryLink', attrs: { id: 'abc123', label: 'Westkapelle Lighthouse', slug: 'w' } },
        { type: 'text', text: ' again.' },
      ],
    },
  ],
};

describe('docToText', () => {
  // §97 (ronde 58): a link is its handle's token, never its name — a legacy
  // link with a label contributes nothing, so no plain text carries a name.
  it('flattens text; a link is its token, and a legacy label is never printed', () => {
    const text = docToText(doc);
    expect(text).toContain('The light at has not been wound.');
    expect(text).not.toContain('Jacob den Hollander');
    const withHandle = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zie ' }, { type: 'entryLink', attrs: { handle: 'abcdef123456' } }] }],
    };
    expect(docToText(withHandle)).toBe('Zie ⟦abcdef123456⟧');
  });

  it('separates blocks with a newline so a diff is line-by-line', () => {
    expect(docToText(doc).split('\n')).toHaveLength(2);
  });

  it('survives rubbish input', () => {
    expect(docToText(null)).toBe('');
    expect(docToText(undefined)).toBe('');
    expect(docToText({})).toBe('');
    expect(docToText({ type: 'doc' })).toBe('');
  });
});

describe('extractEntryLinks', () => {
  it('returns every linked id once, in document order', () => {
    expect(extractEntryLinks(doc)).toEqual(['abc123', 'def456']);
  });

  it('is empty for a document with no links', () => {
    expect(extractEntryLinks({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([]);
  });

  it('ignores links with no id', () => {
    const broken = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'entryLink', attrs: { label: 'x' } }] }],
    };
    expect(extractEntryLinks(broken)).toEqual([]);
  });
});

describe('isEmptyDoc / docExcerpt', () => {
  it('treats a lone empty paragraph as empty', () => {
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDoc(doc)).toBe(false);
  });

  it('truncates on a word boundary', () => {
    const excerpt = docExcerpt(doc, 20);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(21);
  });
});
