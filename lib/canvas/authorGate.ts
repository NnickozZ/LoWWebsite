/**
 * §90: the pure half of `components/canvas/useCanvasAuthorGate.ts` — which
 * press, key or focus on a tekenvlak owes §18b's question. Pure so that the
 * rule is a unit test (`tests/unit/ronde-51-canvas.test.ts`).
 */
export const AUTHOR_GATE_OFF = { 'data-author-gate': 'off' } as const;

type Targetish = {
  closest?: (selector: string) => unknown;
  tagName?: string;
  type?: string;
  readOnly?: boolean;
  disabled?: boolean;
  isContentEditable?: boolean;
} | null;

/** Text you could type into here — not a checkbox, not a read-only box. */
export function isTypable(given: EventTarget | Targetish): boolean {
  const target = given as Targetish;
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return !target.readOnly && !target.disabled;
  if (tag !== 'INPUT') return false;
  if (target.readOnly || target.disabled) return false;
  const type = (target.type ?? 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'].includes(type);
}

/**
 * Does this press, key or focus owe the question? Pure, so the rule is a unit
 * test and not a tap on a phone (`tests/unit/ronde-51-canvas.test.ts`).
 *
 * §101: **a blad over the glass is not the glass.** A `Sheet` is drawn through
 * a portal onto `<body>`, but React sends its events up the *React* tree — so
 * a sheet a canvas opened is still inside the canvas's gate, and everything
 * the sheet does counts as touching the glass. Opening the legenda on a phone
 * therefore asked "met wie ben je nu aan het schrijven?" the moment the blad
 * took the focus, for a panel that only filters. In a blad the rule is §18b's
 * own, whatever mode the canvas is in: **only a box you can really type into**.
 * A button in a blad does what it says; a field in one asks first.
 */
export function gateAsks(writing: boolean, target: EventTarget | null): boolean {
  const el = target as Targetish;
  if (el?.closest?.('[data-author-gate="off"]')) return false;
  if (el?.closest?.('.sheet-backdrop')) return isTypable(el);
  if (writing) return true;
  return isTypable(el);
}

