/**
 * Small, dependency-free fuzzy matcher for names and tags.
 *
 * The corpus here is a campaign wiki — thousands of short strings at most — so
 * scoring every candidate in JS is both fast enough and far more forgiving than
 * an FTS prefix query. Body text still goes through FTS5; this is for names.
 */

export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Positions of query chars in text, in order, or null when not a subsequence. */
function subsequencePositions(text: string, query: string): number[] | null {
  const positions: number[] = [];
  let ti = 0;
  for (const ch of query) {
    const found = text.indexOf(ch, ti);
    if (found === -1) return null;
    positions.push(found);
    ti = found + 1;
  }
  return positions;
}

/** Damerau-free Levenshtein, capped so long strings cost little. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * 0 means no match. Higher is better. The tiers, in order:
 *   1000  exact
 *   900   name starts with the query
 *   800   a word in the name starts with the query
 *   700   the name contains the query
 *   400+  the query is a subsequence, tighter runs score higher
 *   200+  within a small edit distance (typos)
 */
export function fuzzyScore(candidate: string, query: string): number {
  const text = normalise(candidate);
  const q = normalise(query);
  if (!q) return 0;
  if (!text) return 0;

  if (text === q) return 1000;
  if (text.startsWith(q)) return 900 - Math.min(99, text.length - q.length);

  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 800 - Math.min(99, text.length - q.length);

  const contains = text.indexOf(q);
  if (contains !== -1) return 700 - Math.min(99, contains);

  const positions = subsequencePositions(text, q);
  if (positions) {
    const span = positions[positions.length - 1] - positions[0] + 1;
    const tightness = Math.max(0, 200 - (span - q.length) * 8);
    return 400 + tightness;
  }

  const tolerance = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  const distance = editDistance(text, q, tolerance);
  if (distance <= tolerance) return 200 + (tolerance - distance) * 20;

  // Typo inside one word: "harbourmster" vs "harbourmaster"
  for (const word of words) {
    if (Math.abs(word.length - q.length) > tolerance) continue;
    const wordDistance = editDistance(word, q, tolerance);
    if (wordDistance <= tolerance) return 180 + (tolerance - wordDistance) * 20;
  }

  return 0;
}

export type Scored<T> = { item: T; score: number };

export function rankBy<T>(
  items: readonly T[],
  query: string,
  keys: (item: T) => string[],
  limit = 20,
): Scored<T>[] {
  const out: Scored<T>[] = [];
  for (const item of items) {
    let best = 0;
    for (const key of keys(item)) {
      const score = fuzzyScore(key, query);
      if (score > best) best = score;
    }
    if (best > 0) out.push({ item, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
