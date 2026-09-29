import localFont from 'next/font/local';

/**
 * Golf K: de drie letters van het archief, voorgeladen, met een systeemletter
 * op maat erachter.
 *
 * `@fontsource` in `app/globals.css` laat de bestanden pas halen als de
 * stylesheet er is, met `font-display: swap`: de eerste verf stond in een
 * systeemletter en de tekst liep daarna anders af (koud tot CLS 0,1 op een
 * artikel op een computer, gemeten in golf K). `next/font/local` doet twee
 * dingen die met CSS alleen niet kunnen:
 *
 *  - een `<link rel="preload">` voor de latijnse bestanden in de `<head>`, zodat
 *    ze tegelijk met de stylesheet binnenkomen in plaats van erna;
 *  - een eigen systeemletter met `size-adjust` en ascent/descent, uit het
 *    bestand zelf gemeten.
 *
 * Alleen het latijnse deel (de Nederlandse tekens zitten er allemaal in). De
 * `@fontsource`-imports blijven staan: achter deze familie in de stapel
 * (`--sans`, `--serif`, `--stamp-face`) vangen zij met hun `unicode-range` een
 * teken op dat hier niet in staat, en ze worden alleen dan gehaald. De twee
 * leesletters van §29 (Atkinson, OpenDyslexic) blijven van `@fontsource`: die
 * kiest een lezer zelf, en voorladen voor iedereen zou verspilling zijn.
 */
export const bronSans = localFont({
  src: [
    { path: '../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-bron-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const bronSerif = localFont({
  src: [
    { path: '../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-bron-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const stempel = localFont({
  src: [
    { path: '../node_modules/@fontsource/archivo-narrow/files/archivo-narrow-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/archivo-narrow/files/archivo-narrow-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-stempel',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

/** De drie klassen op `<html>`, zodat de variabelen overal gelden. */
export const fontVariables = `${bronSans.variable} ${bronSerif.variable} ${stempel.variable}`;
