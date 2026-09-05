import type { FieldDef } from '@/lib/db/schema';

/**
 * §21: reading the dossier ids out of an artikel's field values.
 *
 * Its own module, and not part of `FieldsEditor`, because the *page* has to
 * call it: a server component that imports a function from a `'use client'`
 * file gets a reference to a client component, not the function. The rule this
 * encodes is worth stating on its own anyway — **only ids are stored**. A name
 * copied into a field would go stale on a rename and, worse, would print the
 * name of a dossier the reader may not open. So the value is ids, and the names
 * are looked up per viewer by `resolveCaseRefs`.
 *
 * It accepts every shape such a field has ever been written in — one ref, a
 * list of refs, a bare string, a list of strings — because a Keeper who changes
 * a field from `case_link` to `case_links` should not lose what was in it.
 */
export function caseIdsIn(value: unknown): string[] {
  const one = (item: unknown): string | null => {
    if (typeof item === 'string') return item || null;
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      return (item as { id: string }).id || null;
    }
    return null;
  };
  if (Array.isArray(value)) return value.map(one).filter((id): id is string => Boolean(id));
  const single = one(value);
  return single ? [single] : [];
}

/** Every dossier id a soort's field values point at, for one bulk lookup. */
export function caseIdsInFields(
  fields: FieldDef[],
  values: Record<string, unknown>,
): string[] {
  return fields.flatMap((field) =>
    field.kind === 'case_link' || field.kind === 'case_links'
      ? caseIdsIn(values[field.key])
      : [],
  );
}
