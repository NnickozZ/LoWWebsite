/**
 * §69: one press of Escape peels one layer, and a popover is the inner layer.
 *
 * `lib/sheetStack.ts` settled this between *sheets* in §18b: two sheets both
 * listening on `document` meant one press shut all of them, so a sheet only
 * listens while it is the top of that pile. This is the same argument one
 * level down. A popover — a suggest list, a menu hanging off a button, the
 * `@`-lijst — is very often open *inside* a sheet, and `Sheet` registers its
 * key handler in the **capture** phase on `document`, which is upstream of
 * everything: the list could not win by listening harder, by listening deeper,
 * or by calling `stopPropagation`. The press reached the sheet first however
 * it was written, and "Nieuw artikel" closed with the half-typed name in it
 * because somebody wanted the suggestions to go away.
 *
 * So the sheet asks instead. While anything is on this pile, Escape is not the
 * sheet's; the popover takes it, closes, and the next press — with the pile
 * empty — is the sheet's again. **Escape only.** Tab still belongs to the top
 * sheet, because a popover does not trap focus; so does a tap on the backdrop,
 * which is a press outside the popover as well and closes both, correctly.
 *
 * Module state rather than context, for `sheetStack`'s two reasons: the two
 * are portals and providers at different heights with no shared parent, and
 * the handler reads this at *event* time, where a render-time value is already
 * stale. No DOM in here on purpose — the ordering is the part worth testing,
 * and it is testable in a plain node.
 */

/** The popovers on screen. Only whether it is empty is ever asked. */
let stack: number[] = [];
let nextId = 1;

/** A popover has opened. Returns the token it must hand back when it closes. */
export function openPopover(): number {
  const id = nextId++;
  stack = [...stack, id];
  return id;
}

/** A popover has closed. Unknown or already-closed tokens are ignored. */
export function closePopover(id: number): void {
  stack = stack.filter((open) => open !== id);
}

/**
 * Is a popover standing in front of the sheets? Then Escape is not theirs.
 * Deliberately not "is *this* one on top": two popovers are never open at once
 * in this app, and if that ever changes, each closes on the press and the pile
 * empties — which is right, because they are siblings on one screen rather
 * than layers over each other.
 */
export function popoverIsOpen(): boolean {
  return stack.length > 0;
}

/** Tests only: an empty screen. */
export function resetPopoverStack(): void {
  stack = [];
  nextId = 1;
}
