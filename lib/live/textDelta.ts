/**
 * §21: the smallest edit that turns `from` into `to` — one delete and one
 * insert at one position. What a `<LiveField>` sends to its Y.Text for every
 * keystroke, however the browser reports it (a typed letter, a pasted word, a
 * replaced selection, an IME composition).
 */
export function textDelta(from: string, to: string): { at: number; remove: number; insert: string } | null {
  if (from === to) return null;
  let prefix = 0;
  const max = Math.min(from.length, to.length);
  while (prefix < max && from.charCodeAt(prefix) === to.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && from.charCodeAt(from.length - 1 - suffix) === to.charCodeAt(to.length - 1 - suffix)) suffix++;
  return { at: prefix, remove: from.length - prefix - suffix, insert: to.slice(prefix, to.length - suffix) };
}
