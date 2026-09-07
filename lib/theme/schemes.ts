/**
 * §45: the four colour schemes.
 *
 * The archive is read from two sides, in two lights: Keeper or speler, licht
 * or donker. That is four palettes, and this file is all four of them — the
 * tokens they are made of, the colours they ship with, and the CSS that turns
 * a saved palette into the variables every screen already reads.
 *
 * Three rules hold it together.
 *
 *  1. **The page picks the side, the person picks the light.** Nothing stores
 *     "this account uses the Keeper colours": a page that is the Keeper's own
 *     (§44) renders `data-side="keeper"` and *is* Keeper-coloured, for whoever
 *     is looking at it — which is only ever a Keeper, because that is what
 *     keeper-only means. Light against dark is the person's, saved on their
 *     account (`users.colour_scheme`), '' being "whatever the system says".
 *
 *  2. **Deliberately pure.** Client components import this, so it never opens
 *     the database. `lib/admin/schemes.ts` is the half that reads and writes
 *     settings, exactly as `lib/words.ts` and `lib/admin/words.ts` divide.
 *
 *  3. **One emitter, two callers.** `schemeCss()` writes the whole block, and
 *     both the stylesheet's defaults and the Keeper's saved palettes go
 *     through it. `app/globals.css` carries the output for DEFAULT_SCHEMES
 *     between two markers, and `tests/unit/schemes.test.ts` fails if the two
 *     ever drift — so a token added here cannot be forgotten there.
 *
 * The selectors are `:has()` on the root and not a class on <body>, for the
 * same reason §29's reading face is: a Sheet renders through a portal onto
 * <body>, outside any wrapper, and only a variable named on the root reaches
 * it. `data-side` is written by the *page*, `data-theme` by the layout, and
 * `:root:has(…)` picks up either wherever it lands.
 */

/** Which half of the light a person reads in. '' follows the system. */
export type ColourScheme = '' | 'light' | 'dark';

export const COLOUR_SCHEMES: ColourScheme[] = ['', 'light', 'dark'];

export function cleanColourScheme(value: unknown): ColourScheme {
  return value === 'light' || value === 'dark' ? value : '';
}

/**
 * What Jouw account calls each half of the light — the same three-chip shape
 * §29's Lettertype has, and for the same reason: the choice *is* the action,
 * so there is nothing to press afterwards.
 */
export const COLOUR_SCHEME_CHOICES: { value: ColourScheme; label: string; hint: string }[] = [
  {
    value: '',
    label: 'Systeem',
    hint: 'Wat je apparaat zegt: licht overdag, donker als je telefoon dat ’s avonds omzet.',
  },
  { value: 'light', label: 'Licht', hint: 'Altijd licht papier, wat het apparaat er ook van vindt.' },
  { value: 'dark', label: 'Donker', hint: 'Altijd donker papier — prettig aan tafel bij weinig licht.' },
];

/** The four palettes, by key. */
export type SchemeKey = 'playerLight' | 'playerDark' | 'keeperLight' | 'keeperDark';

export const SCHEME_KEYS: SchemeKey[] = ['playerLight', 'playerDark', 'keeperLight', 'keeperDark'];

export const SCHEME_LABELS: Record<SchemeKey, string> = {
  playerLight: 'Spelers — licht',
  playerDark: 'Spelers — donker',
  keeperLight: 'Keeper — licht',
  keeperDark: 'Keeper — donker',
};

/** Is this one of the dark halves? Decides `color-scheme` and the speck's alpha. */
export const SCHEME_IS_DARK: Record<SchemeKey, boolean> = {
  playerLight: false,
  playerDark: true,
  keeperLight: false,
  keeperDark: true,
};

export type TokenKey =
  | 'paper'
  | 'paperDark'
  | 'paperRaised'
  | 'ink'
  | 'inkMuted'
  | 'rule'
  | 'stampRed'
  | 'stringRed'
  | 'link'
  | 'cork'
  | 'corkSpeck'
  | 'cardFace'
  | 'cardRule'
  | 'lineInk'
  | 'lineRed'
  | 'lineBlue'
  | 'lineGold'
  | 'lineGreen'
  | 'lineViolet';

export type TokenDef = {
  key: TokenKey;
  /** The CSS custom property it is written to. */
  css: string;
  /** What it colours, in Dutch, beside the picker. */
  what: string;
  group: 'paper' | 'board' | 'web';
};

/**
 * Every colour a Keeper may turn. Nineteen, not the hundred the stylesheet
 * has: the rest are `var()` aliases onto these, written once in globals.css —
 * `--web-mention: var(--web-line-ink)` and its twenty-one siblings — so the
 * web's line colours are six choices rather than twenty-two.
 *
 * `--accent` is not here either. It has always been "whatever the stamp is",
 * and the emitter writes it as `var(--stamp-red)` so it stays that.
 */
export const TOKENS: TokenDef[] = [
  { key: 'paper', css: '--paper', what: 'Het papier — de achtergrond van elke pagina', group: 'paper' },
  { key: 'paperDark', css: '--paper-dark', what: 'Papier in de schaduw — balken, koppen, de rand van het menu', group: 'paper' },
  { key: 'paperRaised', css: '--paper-raised', what: 'Papier dat omhoog ligt — kaarten, vakken, sheets', group: 'paper' },
  { key: 'ink', css: '--ink', what: 'De inkt — alle gewone tekst', group: 'paper' },
  { key: 'inkMuted', css: '--ink-muted', what: 'Zachte inkt — bijschriften en uitleg', group: 'paper' },
  { key: 'rule', css: '--rule', what: 'De liniaal — lijnen, randen, scheidingen', group: 'paper' },
  { key: 'stampRed', css: '--stamp-red', what: 'De stempel — knoppen, accenten, wat nadruk vraagt', group: 'paper' },
  { key: 'stringRed', css: '--string-red', what: 'Het draadje — de rode draad tussen twee kaarten', group: 'paper' },
  { key: 'link', css: '--link', what: 'Een verwijzing — alles waar je op kunt klikken', group: 'paper' },
  { key: 'cork', css: '--cork', what: 'Het kurk van een prikbord', group: 'board' },
  { key: 'corkSpeck', css: '--cork-speck', what: 'De spikkels in het kurk', group: 'board' },
  { key: 'cardFace', css: '--card-face', what: 'Het vlak van een kaart op een prikbord', group: 'board' },
  { key: 'cardRule', css: '--card-rule', what: 'De rand van zo’n kaart', group: 'board' },
  { key: 'lineInk', css: '--web-line-ink', what: 'Web: wat de tekst noemt', group: 'web' },
  { key: 'lineRed', css: '--web-line-red', what: 'Web: wat op een prikbord hangt', group: 'web' },
  { key: 'lineBlue', css: '--web-line-blue', what: 'Web: wat op een landkaart staat', group: 'web' },
  { key: 'lineGold', css: '--web-line-gold', what: 'Web: wat in een dossier zit', group: 'web' },
  { key: 'lineGreen', css: '--web-line-green', what: 'Web: wat op een tijdlijn staat', group: 'web' },
  { key: 'lineViolet', css: '--web-line-violet', what: 'Web: wie het leest en schrijft', group: 'web' },
];

export const TOKEN_GROUPS: { group: TokenDef['group']; title: string; note: string }[] = [
  { group: 'paper', title: 'Papier en inkt', note: 'De negen kleuren waar elk scherm op staat.' },
  { group: 'board', title: 'Het prikbord', note: 'Alleen het kurk en de kaarten die erop hangen.' },
  { group: 'web', title: 'Het web', note: 'De zes kleuren waarin het web zijn lijnen tekent.' },
];

export type Palette = Record<TokenKey, string>;
export type Schemes = Record<SchemeKey, Palette>;

/* ------------------------------------------------------------- defaults */

/** The archive's own colours: what every screen looked like before §45. */
const PLAYER_LIGHT: Palette = {
  paper: '#f3eee2',
  paperDark: '#e6dfcf',
  paperRaised: '#f8f4ea',
  ink: '#1f1b16',
  inkMuted: '#5c544a',
  rule: '#c9c0ad',
  stampRed: '#a8321e',
  stringRed: '#c0392b',
  link: '#1f4e79',
  cork: '#c2a276',
  corkSpeck: '#5a3e20',
  cardFace: '#fbf7ec',
  cardRule: '#cdbfa4',
  lineInk: '#2a2118',
  lineRed: '#c0392b',
  lineBlue: '#1f4e79',
  lineGold: '#8a6a24',
  lineGreen: '#2f6b4f',
  lineViolet: '#5b3a78',
};

const PLAYER_DARK: Palette = {
  paper: '#1b1915',
  paperDark: '#14120f',
  paperRaised: '#23201b',
  ink: '#e8e1d2',
  inkMuted: '#a49b8a',
  rule: '#3d382f',
  stampRed: '#a8321e',
  stringRed: '#c0392b',
  link: '#8fb8dd',
  cork: '#4a3a26',
  corkSpeck: '#000000',
  cardFace: '#e9e2d2',
  cardRule: '#8b7f68',
  lineInk: '#e8e1d2',
  lineRed: '#e2705f',
  lineBlue: '#8fb8dd',
  lineGold: '#d4b45f',
  lineGreen: '#7fc79c',
  lineViolet: '#b78fd8',
};

/**
 * The Keeper's side, in daylight. Cooler and a shade greyer than the players'
 * paper — the same archive seen from the office behind it rather than the
 * reading room — with a deeper oxblood stamp and a teal for links, so that a
 * glance at the screen says which side you are standing on before you have
 * read a word.
 */
const KEEPER_LIGHT: Palette = {
  paper: '#e7e4dd',
  paperDark: '#d6d2c8',
  paperRaised: '#f0eee9',
  ink: '#191d1b',
  inkMuted: '#55605b',
  rule: '#b5b3a7',
  stampRed: '#8c2417',
  stringRed: '#b03a2a',
  link: '#1c4f5c',
  cork: '#ab9a80',
  corkSpeck: '#4a3a24',
  cardFace: '#f4f1e8',
  cardRule: '#c3bda9',
  lineInk: '#22231f',
  lineRed: '#b03a2a',
  lineBlue: '#1c4f5c',
  lineGold: '#7d6320',
  lineGreen: '#2c5f4a',
  lineViolet: '#543670',
};

/** The Keeper's side at night: cold near-black, where the players' dark is warm brown. */
const KEEPER_DARK: Palette = {
  paper: '#14171a',
  paperDark: '#0e1114',
  paperRaised: '#1d2126',
  ink: '#dfe5e6',
  inkMuted: '#97a2a4',
  rule: '#333c41',
  stampRed: '#c04a34',
  stringRed: '#d2624c',
  link: '#7fc3d4',
  cork: '#3b3a30',
  corkSpeck: '#000000',
  cardFace: '#e6e6dc',
  cardRule: '#85857a',
  lineInk: '#dfe5e6',
  lineRed: '#e2705f',
  lineBlue: '#7fc3d4',
  lineGold: '#d4b45f',
  lineGreen: '#7fc79c',
  lineViolet: '#b78fd8',
};

export const DEFAULT_SCHEMES: Schemes = {
  playerLight: PLAYER_LIGHT,
  playerDark: PLAYER_DARK,
  keeperLight: KEEPER_LIGHT,
  keeperDark: KEEPER_DARK,
};

/* ------------------------------------------------------------ validation */

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isColour(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/**
 * A saved settings blob, made safe. Anything missing or malformed falls back
 * to the archive's own colour for that token, so a half-filled scheme is a
 * scheme, and nothing a Keeper can type into the form can reach the CSS but
 * six hex digits.
 */
export function cleanSchemes(value: unknown, fallbackAccent?: unknown): Schemes {
  const saved = (value ?? {}) as Partial<Record<SchemeKey, Partial<Record<TokenKey, unknown>>>>;
  const accent = isColour(fallbackAccent) ? fallbackAccent : null;
  const out = {} as Schemes;
  for (const key of SCHEME_KEYS) {
    const from = saved[key] ?? {};
    const base = DEFAULT_SCHEMES[key];
    const palette = {} as Palette;
    for (const token of TOKENS) {
      const given = from[token.key];
      if (isColour(given)) palette[token.key] = given.toLowerCase();
      // §11's accent, folded in: a Keeper who set one before §45 keeps it as
      // the stamp of all four schemes until they say otherwise.
      else if (accent && token.key === 'stampRed') palette[token.key] = accent.toLowerCase();
      else palette[token.key] = base[token.key];
    }
    out[key] = palette;
  }
  return out;
}

/** True when this palette is the archive's own, token for token. */
export function isDefaultPalette(key: SchemeKey, palette: Palette): boolean {
  return TOKENS.every((token) => palette[token.key] === DEFAULT_SCHEMES[key][token.key]);
}

/* ---------------------------------------------------------------- CSS */

/** How opaque the kurk's speckle is, per half. Baked in so the picker stays a plain colour. */
const SPECK_ALPHA: Record<'light' | 'dark', string> = { light: '29', dark: '4d' };

function paletteVars(key: SchemeKey, palette: Palette): string {
  const dark = SCHEME_IS_DARK[key];
  const lines = TOKENS.map((token) => {
    const value =
      token.key === 'corkSpeck'
        ? `${palette.corkSpeck}${SPECK_ALPHA[dark ? 'dark' : 'light']}`
        : palette[token.key];
    return `  ${token.css}: ${value};`;
  });
  // --accent has always been "whatever the stamp is". Keep it an alias so a
  // Keeper turning the stamp turns both, and nobody has to know there are two.
  lines.push('  --accent: var(--stamp-red);');
  lines.push(`  color-scheme: ${dark ? 'dark' : 'light'};`);
  return lines.join('\n');
}

/**
 * The selectors each scheme is written under, in cascade order.
 *
 * Two attributes say which side a screen is on, and they are read together
 * (§46). The signed-in layout writes `data-side="keeper"` on its wrapper when
 * the *browser* stands on the Keeper's side; a record's page writes its own
 * `data-side` — 'keeper' or 'player' — for the record it shows. The page wins:
 * the Keeper's colours are used when something says keeper *and nothing says
 * player*, so a player-facing artikel reached from the Keeper's side is painted
 * as what it is, and a keeper-only one reached from the players' side likewise.
 * That is what "the site turns over with you" means in CSS.
 *
 * Both live *inside* <body> and both are found from the root with `:has()`,
 * because a Sheet is portalled onto <body> and only a variable named on the
 * root reaches it. Specificity does the choosing — `:root:has(A):not(:has(B))`
 * (0,3,0) beats `:root:has(A)` (0,2,0) beats `:root` (0,1,0) — so the four
 * blocks can be written in one order and read in another.
 *
 * The media block is the "system says dark" half, and every rule in it is
 * fenced with `:not(:has([data-theme='light']))` — a person who chose Licht
 * means it, even at midnight.
 */
const NOT_LIGHT = `:root:not(:has([data-theme='light']))`;
/** Keeper-coloured: something says keeper, and nothing on the page says player. */
const KEEPER = `:has([data-side='keeper']):not(:has([data-side='player']))`;

export function schemeCss(schemes: Schemes): string {
  const light = paletteVars('playerLight', schemes.playerLight);
  const dark = paletteVars('playerDark', schemes.playerDark);
  const keeperLight = paletteVars('keeperLight', schemes.keeperLight);
  const keeperDark = paletteVars('keeperDark', schemes.keeperDark);
  return [
    `:root {\n${light}\n}`,
    `:root${KEEPER} {\n${keeperLight}\n}`,
    `:root:has([data-theme='dark']) {\n${dark}\n}`,
    `:root:has([data-theme='dark'])${KEEPER} {\n${keeperDark}\n}`,
    `@media (prefers-color-scheme: dark) {\n${NOT_LIGHT} {\n${dark}\n}\n${NOT_LIGHT}${KEEPER} {\n${keeperDark}\n}\n}`,
  ].join('\n\n');
}

/** The same, on one line, for the `<style>` the layout renders. */
export function schemeStyle(schemes: Schemes): string {
  return schemeCss(schemes).replace(/\n\s*/g, '');
}

/** What the layout writes on its wrapper: 'light', 'dark', or nothing at all. */
export function themeAttr(scheme: ColourScheme): string | undefined {
  return scheme === 'light' || scheme === 'dark' ? scheme : undefined;
}

/* --------------------------------------------------------- readability */

/**
 * WCAG's floor for body text, and the number the Kleuren pane warns below.
 * 4.5:1 and not 3:1 because the thing being measured is prose — an artikel is
 * paragraphs, not headings.
 */
export const MIN_CONTRAST = 4.5;

/** WCAG relative luminance of a `#rrggbb`. Anything unreadable answers 0. */
function relativeLuminance(hex: string): number {
  if (!isColour(hex)) return 0;
  const n = parseInt(hex.slice(1), 16);
  const channel = (byte: number) => {
    const c = byte / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The WCAG contrast ratio between two colours, 1 (identical) to 21 (black on
 * white). Pure and symmetrical, so the form can call it on every keystroke
 * and a test can pin the numbers without a browser.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Is the inkt still readable on this paper? The Kleuren pane says so beside
 * every palette rather than refusing the save: a Keeper may know exactly what
 * they are doing, and the archive is theirs — but nobody should be able to
 * turn the whole thing unreadable by accident and only find out on a phone in
 * a tent.
 */
export function paletteReadable(palette: Palette): boolean {
  return contrastRatio(palette.ink, palette.paper) >= MIN_CONTRAST;
}
