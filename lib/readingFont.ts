/**
 * §29: the face a person reads the archive in.
 *
 * The archive's own type is a 1930s one — a narrow serif for prose, a narrow
 * grotesque for stamps — and that is the point of it. It is also, for some
 * people, the hardest thing on the page. So there is a third dial in Jouw
 * account beside the theme and the face an artikel opens in, and it swaps the
 * *reading* faces only: prose, headings, inputs, cards. The stamps, the type
 * on a file cover, the tabs — anything whose job is to look like a rubber
 * stamp — keep `--stamp-face`, because a dyslexia setting that flattens the
 * whole archive into one font takes the archive away rather than making it
 * readable.
 *
 * Two alternatives rather than one, because people differ and the evidence
 * does too. *Atkinson Hyperlegible* was drawn by the Braille Institute to make
 * letters that are easy to confuse — I l 1, O 0, b d p q — tell each other
 * apart, and it still looks like a book. *OpenDyslexic* weights the bottom of
 * every letter so the shapes cannot flip, which some readers swear by and
 * others find loud. Neither is a cure and neither is imposed: the default is
 * the archive's own.
 *
 * Both are bundled through `@fontsource`, so this adds no runtime fetch — the
 * one promise the front page of the README makes.
 *
 * Pure and dependency-free: the schema, the server and the browser all read it.
 */
export type ReadingFont = '' | 'atkinson' | 'opendyslexic';

export function cleanReadingFont(value: unknown): ReadingFont {
  return value === 'atkinson' || value === 'opendyslexic' ? value : '';
}

/**
 * The value of `data-font` on `<html>`. CSS does the rest — one attribute
 * selector that re-points `--serif` and `--sans`, so every screen follows
 * without a single component knowing this setting exists.
 */
export function readingFontAttr(font: ReadingFont): string | undefined {
  return font || undefined;
}

/**
 * A font stack for showing one choice *in* that choice, before it is chosen.
 *
 * The account page prints each hint in the letter it describes, which is the
 * only honest way to offer this: "Elke letter is onderaan verzwaard" set in
 * Source Serif tells nobody whether they can read OpenDyslexic. The tail is
 * `var(--serif)` rather than a copy of the stack in globals.css, so the
 * fallback stays whatever the archive's letter happens to be — including the
 * one already in force.
 */
export function readingFontStack(font: ReadingFont): string {
  if (font === 'atkinson') return "'Atkinson Hyperlegible', var(--serif)";
  if (font === 'opendyslexic') return "'OpenDyslexic', var(--serif)";
  return 'var(--serif)';
}

/** What the account page calls each choice. */
export const READING_FONT_CHOICES: { value: ReadingFont; label: string; hint: string }[] = [
  {
    value: '',
    label: 'Archief',
    hint: 'De letter van het archief zelf: een smalle schreefletter voor tekst.',
  },
  {
    value: 'atkinson',
    label: 'Beter leesbaar',
    hint: 'Atkinson Hyperlegible. Letters die op elkaar lijken (I l 1, O 0) zijn uit elkaar getrokken.',
  },
  {
    value: 'opendyslexic',
    label: 'Dyslexie',
    hint: 'OpenDyslexic. Elke letter is onderaan verzwaard, zodat vormen niet omklappen.',
  },
];
