export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/**
 * Line diff over the plain-text projection of two revisions. Small LCS — the
 * inputs are entry bodies, not source trees, so the quadratic table is fine.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const rows = a.length;
  const cols = b.length;

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < rows) out.push({ kind: 'removed', text: a[i++] });
  while (j < cols) out.push({ kind: 'added', text: b[j++] });

  return out.filter((line) => line.text.trim() !== '' || line.kind !== 'same');
}

export function relativeTime(unixSeconds: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(now / 1000) - unixSeconds);
  if (seconds < 60) return 'zojuist';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minuut geleden' : `${minutes} minuten geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'gisteren';
  if (days < 30) return `${days} dagen geleden`;
  return new Date(unixSeconds * 1000).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
