/**
 * §69 — one wait before a suggest list asks the archive.
 *
 * Six boxes in this app do the same thing: somebody types, and 160 ms after the
 * last keystroke the box asks `/api/suggest` (or `/api/keeper/search`) what it
 * could mean. They each had that number written out, which is six places for it
 * to drift apart — and it is the kind of number that gets nudged, because it is
 * the one dial between "the list is already there" and "the archive is asked
 * once per word instead of once per letter".
 *
 * 160 ms is roughly a fast typist's gap between letters, so a word typed
 * straight through asks once. Nothing else about a suggest list belongs here:
 * how many rows, which soorten, whether an aanmaak-rij is offered, and what a
 * row does are each box's own business.
 *
 * The one 160 in the app that is *not* this is `WebCanvas`'s idle timer, which
 * decides when a camera that has stopped moving gets its sharp layer back. Same
 * number, different reason — do not fold it in here.
 */
export const SUGGEST_DEBOUNCE_MS = 160;
