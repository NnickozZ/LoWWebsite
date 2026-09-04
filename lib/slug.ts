/**
 * Slugify with Dutch-friendly transliteration. Keeps IJ/ij readable and strips
 * diacritics so "Westkapelle Vuurtoren" and "Café 't Anker" both behave.
 */
export function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[''`]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'entry';
}

/**
 * Returns a slug not already present in `taken`. Appends -2, -3, … rather than
 * random noise, so URLs stay readable.
 */
export function uniqueSlug(input: string, taken: (candidate: string) => boolean): string {
  const base = slugify(input);
  if (!taken(base)) return base;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
