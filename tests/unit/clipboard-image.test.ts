import { describe, expect, it } from 'vitest';
import { imageFromClipboard, pasteIsForTyping } from '@/lib/upload';

/**
 * §30: anywhere the archive takes a picture, a paste has to work too.
 *
 * The rule this file pins is the one that is not obvious and that four places
 * in the app got wrong the same way: a browser puts a picture on the clipboard
 * in *two* shapes, and reading only `clipboardData.files` misses the commoner
 * of them. Copying a file in Finder or Explorer fills `.files`; a screenshot,
 * or a picture copied out of a web page, arrives only as an `image/*` item
 * under `.items` — with no name of its own. Anything that reads one shape
 * silently ignores the other, which is a paste that does nothing and says
 * nothing.
 */

/** A clipboard with files on it, the Finder/Explorer shape. */
function withFiles(files: File[]): ClipboardEvent {
  return { clipboardData: { files, items: [] } } as unknown as ClipboardEvent;
}

/** A clipboard with items on it, the screenshot shape. */
function withItems(items: { kind: string; type: string; file?: File | null }[]): ClipboardEvent {
  return {
    clipboardData: {
      files: [],
      items: items.map((item) => ({
        kind: item.kind,
        type: item.type,
        getAsFile: () => item.file ?? null,
      })),
    },
  } as unknown as ClipboardEvent;
}

const png = (name: string, type = 'image/png') => new File([new Uint8Array([1, 2, 3])], name, { type });

describe('imageFromClipboard', () => {
  it('takes the picture out of clipboardData.files, name and all', () => {
    const found = imageFromClipboard(withFiles([png('eiland.png')]));
    expect(found?.name).toBe('eiland.png');
    expect(found?.type).toBe('image/png');
  });

  it('walks past what is not a picture', () => {
    const pdf = new File([new Uint8Array([1])], 'brief.pdf', { type: 'application/pdf' });
    expect(imageFromClipboard(withFiles([pdf]))).toBeNull();
    expect(imageFromClipboard(withFiles([pdf, png('kaart.png')]))?.name).toBe('kaart.png');
  });

  it('finds a screenshot, which has no file in .files at all', () => {
    // The shape that used to be ignored everywhere: an item, not a file.
    const found = imageFromClipboard(withItems([{ kind: 'file', type: 'image/png', file: png('image.png') }]));
    expect(found).not.toBeNull();
    expect(found?.type).toBe('image/png');
  });

  it('gives a nameless paste a dated Dutch name rather than "image.png"', () => {
    // Nine screenshots pasted onto a wall must not be nine things called image.
    const found = imageFromClipboard(withItems([{ kind: 'file', type: 'image/png', file: png('image.png') }]));
    expect(found?.name).toMatch(/^Geplakt \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.png$/);
  });

  it('keeps a name the picture already had', () => {
    const found = imageFromClipboard(withItems([{ kind: 'file', type: 'image/jpeg', file: png('vuurtoren.jpg', 'image/jpeg') }]));
    expect(found?.name).toBe('vuurtoren.jpg');
  });

  it('writes jpeg as .jpg on a name it made up itself', () => {
    const found = imageFromClipboard(withItems([{ kind: 'file', type: 'image/jpeg', file: png('image.png', 'image/jpeg') }]));
    expect(found?.name).toMatch(/\.jpg$/);
  });

  it('is null for a text paste, so prose keeps working', () => {
    expect(imageFromClipboard(withItems([{ kind: 'string', type: 'text/plain' }]))).toBeNull();
    expect(imageFromClipboard(withItems([{ kind: 'string', type: 'text/html' }]))).toBeNull();
    expect(imageFromClipboard(withFiles([]))).toBeNull();
  });

  it('is null for an item that promises a file and hands back nothing', () => {
    expect(imageFromClipboard(withItems([{ kind: 'file', type: 'image/png', file: null }]))).toBeNull();
  });

  it('is null when there is no clipboard on the event', () => {
    expect(imageFromClipboard({ clipboardData: null } as unknown as ClipboardEvent)).toBeNull();
  });
});

describe('pasteIsForTyping', () => {
  /** The one thing the helper asks of its target. */
  const target = (matches: string[]) =>
    ({ closest: (selector: string) => (matches.some((m) => selector.includes(m)) ? {} : null) }) as unknown as EventTarget;

  it('leaves a paste alone when somebody is typing in a field', () => {
    expect(pasteIsForTyping(target(['input']))).toBe(true);
    expect(pasteIsForTyping(target(['textarea']))).toBe(true);
    expect(pasteIsForTyping(target(['.ProseMirror']))).toBe(true);
  });

  it('claims a paste that landed on the page itself', () => {
    expect(pasteIsForTyping(target([]))).toBe(false);
    expect(pasteIsForTyping(null)).toBe(false);
    expect(pasteIsForTyping({} as EventTarget)).toBe(false);
  });
});
