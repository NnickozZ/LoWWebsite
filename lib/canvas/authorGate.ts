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
  // §105 (golf J): a link reads, in either mode — *Artikel openen* on a speld
  // asked in Bewerken, and the question ate the navigation.
  if (!isTypable(el) && el?.closest?.('a[href]')) return false;
  if (writing) return true;
  return isTypable(el);
}

/**
 * §105 (golf J, stuk 2b/3) — *wanneer* een druk op een vlak de vraag schuldig
 * is: nu, pas als hij beweegt, of nooit.
 *
 * In Bewerken vroeg elke druk op het glas §18b's vraag — ook een klik op een
 * prikbordkaart om hem te lezen, of op een speld om zijn peek te zien. Een
 * computer opent een vlak in Bewerken, dus daar vroeg lezen om een schrijver.
 * De regel is nu die van §18b zelf: **de vraag komt bij een handeling die
 * schrijft**.
 *
 * - `never`: wat alleen leest — een link, kaal papier (pannen, een kader
 *   trekken; een dubbelklik die iets maakt vraagt zelf, `useMakeOnEmpty`), en
 *   in Lezen alles wat geen vak is;
 * - `on-move`: een ding op het glas (`things`): kiezen is lezen, maar wie het
 *   versleept, schrijft — de vraag komt zodra de druk een sleep wordt;
 * - `now`: een vak om in te typen, het potlood, en elke knop (die vraagt zoals
 *   altijd, of draagt zelf `useCanvasMaker`).
 *
 * `glass` en `things` zijn selectors van het vlak zelf (de stage, en wat erop
 * staat). Zonder `glass` is dit `gateAsks`.
 */
export type PressAsk = 'now' | 'on-move' | 'never';

type Containsish = { contains?: (other: unknown) => boolean } | null | undefined;

const CONTROLS = 'button, select, label, [role="button"], [role="menuitem"], [role="option"]';

export function gatePress(
  writing: boolean,
  target: EventTarget | null,
  where?: { glass: string; things: string },
): PressAsk {
  if (!where) return gateAsks(writing, target) ? 'now' : 'never';
  const el = target as Targetish;
  if (el?.closest?.('[data-author-gate="off"]')) return 'never';
  if (isTypable(el)) return 'now';
  if (el?.closest?.('.sheet-backdrop')) return 'never';
  if (!writing) return 'never';
  if (el?.closest?.('.ink-capture')) return 'now';
  const onGlass = Boolean(el?.closest?.(where.glass));
  const thing = onGlass ? (el?.closest?.(where.things) as Containsish) : null;
  const control = el?.closest?.(CONTROLS) as Containsish;
  if (thing) {
    // A button *inside* a card (not the card itself) is a control, as before.
    if (control && control !== thing && thing.contains?.(control)) return 'now';
    // The card's name is a link, and a card is dragged by it: a thing first.
    return 'on-move';
  }
  if (el?.closest?.('a[href]')) return 'never';
  if (!onGlass) return 'now';
  if (control) return 'now';
  return 'never';
}

/** How far a press may travel before it is a drag (and so a write). */
export const PRESS_SLOP = 4;

