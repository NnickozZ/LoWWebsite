/**
 * §69 — `+`, `−` en `0` op elk canvas.
 *
 * The tijdlijn has had these since it was written and was the only surface
 * that did; the prikbord, the landkaart and the stamboom answered no key at
 * all. This is the *reading* of the key and nothing else, on purpose: every
 * canvas keeps its own guards, because they differ for reasons worth keeping —
 * the prikbord ignores a key while somebody is typing in a card, the stamboom
 * hands Ctrl+Z to the potlood before it looks, and the tijdlijn only listens
 * while its stage has focus.
 *
 * A modifier means the key is not ours: Ctrl+`+` is the browser's own zoom and
 * must stay the browser's, and Cmd+`0` resets it.
 */
export type CameraKey = 'in' | 'out' | 'fit';

export function cameraKey(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): CameraKey | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  // `=` is the unshifted key that carries `+` on most layouts, and `_` the one
  // that carries `−`; both are what a hand actually presses.
  if (event.key === '+' || event.key === '=') return 'in';
  if (event.key === '-' || event.key === '_') return 'out';
  if (event.key === '0') return 'fit';
  return null;
}
