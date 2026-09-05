/**
 * The server half of `components/SortFilterBar.tsx`: reading back what the
 * bar wrote into the URL. Kept out of that file because it is a client
 * module, and a server page cannot call a function that lives in one.
 */

export type ListParams = Record<string, string | string[] | undefined>;

/** One value: `?sort=name` → 'name'; absent or unknown → the default. */
export function readOne(params: ListParams, key: string, allowed: readonly string[], fallback: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && allowed.includes(value) ? value : fallback;
}

/** Many values: `?status=open,cold` → ['open', 'cold'], unknown ones dropped. */
export function readMany(params: ListParams, key: string, allowed: readonly string[]): string[] {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  return value.split(',').filter((v) => allowed.includes(v));
}

/** A flag: `?mine=1` → true. */
export function readFlag(params: ListParams, key: string): boolean {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true' || value === 'ja';
}
