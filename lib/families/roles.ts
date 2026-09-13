import type { FieldRole, RoleFieldInfo } from './types';

/**
 * §66 — what a koppelingsveld *means* in a stamboom.
 *
 * Kinship is a fact about a person, so it lives on the artikel: a koppelingsveld
 * (`entry_link` / `entry_links`) carries an optional `role`, and every stamboom
 * that person stands in draws the line. This file is the whole of that reading —
 * which roles exist, what they are called in Dutch, which one mirrors which, and
 * how a soort's field definitions plus one artikel's values become lines.
 *
 * Pure on purpose: no database, no React, nothing that loads sqlite or sharp, so
 * the canvas (a client component) imports it directly and
 * `tests/unit/family-roles.test.ts` can pin it down without a server.
 */

// ---------------------------------------------------------------------------
// The four roles
// ---------------------------------------------------------------------------

export const FIELD_ROLES: readonly FieldRole[] = ['parent', 'child', 'partner', 'kin'] as const;

export function isFieldRole(value: unknown): value is FieldRole {
  return typeof value === 'string' && (FIELD_ROLES as readonly string[]).includes(value);
}

/**
 * The word for a role on its own, for the Beheer select and for a line whose
 * field has no label of its own. A *field's* label is what is actually printed
 * on the line — "Geschapen door" is a `parent` with a god's vocabulary — so
 * these four are the fallback, never the headline.
 */
export const ROLE_LABELS: Record<FieldRole, string> = {
  parent: 'Ouder',
  child: 'Kind',
  partner: 'Partner',
  kin: 'Verwant',
};

/**
 * One sentence per role, printed under the select in Beheer. They say what the
 * role does to the *drawing*, because that is the thing a Keeper cannot guess
 * from the word: a role is a direction in a stamboom, not a category.
 */
export const ROLE_HINTS: Record<FieldRole, string> = {
  parent: 'Wie hier staat, staat een generatie hoger.',
  child: 'Wie hier staat, staat een generatie lager.',
  partner: 'Wie hier staat, staat ernaast, op dezelfde rij.',
  kin: 'Een zijlijn: een gestippelde lijn zonder generatie.',
};

/**
 * The role the *other* side of a line carries, which is what the server mirrors
 * with: writing "Kinderen: B" on A puts A in B's first `parent`-role field.
 * `kin` is not mirrored — an aspect, an eed, a vermoeden is one person's claim —
 * so it has no inverse.
 */
export function inverseRole(role: FieldRole): FieldRole | null {
  switch (role) {
    case 'parent':
      return 'child';
    case 'child':
      return 'parent';
    case 'partner':
      return 'partner';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reading a field's value
// ---------------------------------------------------------------------------

/**
 * The artikel ids a koppelingsveld's value points at, in every shape such a
 * field has ever been written in — one ref object, a list of refs, a bare id, a
 * list of ids.
 *
 * This is deliberately a *copy* of `entryIdsIn` in `lib/entries/mentions.ts`
 * rather than an import of it: that file opens the database at module load
 * (`@/lib/db`, `@/lib/timelines/service`), and everything in `lib/families`
 * below `graph.ts` must be importable from a client component. The two readings
 * must agree, so if a fifth shape ever turns up, change both — and there is a
 * test here that walks the same four shapes.
 */
export function refIdsIn(value: unknown): string[] {
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

// ---------------------------------------------------------------------------
// A soort's role fields
// ---------------------------------------------------------------------------

/**
 * The shape this file needs out of a `FieldDef`, spelled structurally so nothing
 * here has to import `lib/db/schema` (which loads drizzle and the database).
 */
export type RoleFieldSource = {
  key: string;
  label: string;
  kind: string;
  role?: string;
  ofType?: string[];
};

/**
 * Which of a soort's fields take part in a stamboom: the koppelingsvelden that
 * carry a valid role, in the order the soort lists them. A `text` field with a
 * `role` on it is not one — the role is only meaningful where there is an
 * artikel on the other end — and neither is a koppelingsveld without one, which
 * is the ordinary case ("Werkgever", "Familie").
 */
export function roleFieldsOf(defs: readonly RoleFieldSource[]): RoleFieldInfo[] {
  const out: RoleFieldInfo[] = [];
  for (const def of defs ?? []) {
    if (!def || typeof def.key !== 'string' || !def.key) continue;
    if (def.kind !== 'entry_link' && def.kind !== 'entry_links') continue;
    if (!isFieldRole(def.role)) continue;
    const ofType = Array.isArray(def.ofType)
      ? def.ofType.filter((slug): slug is string => typeof slug === 'string' && Boolean(slug))
      : undefined;
    out.push({
      key: def.key,
      label: typeof def.label === 'string' && def.label ? def.label : ROLE_LABELS[def.role],
      role: def.role,
      ...(ofType && ofType.length ? { ofType } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fields → lines
// ---------------------------------------------------------------------------

/**
 * One line read off one artikel's infobox. `from` and `to` are **entry ids**,
 * not `GraphNodeId`s — the graph builder wraps them, because a line read off a
 * field always joins two artikelen.
 *
 * For `role: 'parent'` the line runs **parent → child**, whichever way round the
 * field was written: that is the one normalisation this reading does, and it is
 * what lets "Ouders" on the child and "Kinderen" on the parent describe the same
 * line rather than two.
 */
export type FieldEdge = {
  from: string;
  to: string;
  role: FieldRole;
  /** The word on the line: the field's own label. */
  label: string;
  /** Which field said it, so the canvas knows what to PATCH to take it away. */
  fieldKey: string;
  /** The id the field holds — the *other* end, always. */
  targetId: string;
};

/**
 * Every line one artikel's infobox draws.
 *
 * A `parent`-role field on A holding B means B is the parent of A, so the line
 * runs B → A; a `child`-role field on A holding B runs A → B. `partner` and
 * `kin` are undirected and are returned as stored, A → B, so the canvas can tell
 * which artikel said it; `dedupeEdges` is what collapses the two halves of a
 * mirrored pair.
 */
export function edgesFromFields(
  entryId: string,
  defs: readonly RoleFieldSource[],
  values: Record<string, unknown>,
): FieldEdge[] {
  const out: FieldEdge[] = [];
  if (!entryId) return out;
  for (const field of roleFieldsOf(defs)) {
    const seen = new Set<string>();
    for (const targetId of refIdsIn((values ?? {})[field.key])) {
      // A line from somebody to themselves is not a line, and the same id twice
      // in one field is a picker that was pressed twice.
      if (!targetId || targetId === entryId || seen.has(targetId)) continue;
      seen.add(targetId);
      const base = { role: field.role, label: field.label, fieldKey: field.key, targetId };
      if (field.role === 'parent') {
        out.push({ ...base, role: 'parent', from: targetId, to: entryId });
      } else if (field.role === 'child') {
        out.push({ ...base, role: 'parent', from: entryId, to: targetId });
      } else {
        out.push({ ...base, from: entryId, to: targetId });
      }
    }
  }
  return out;
}

/** The pair-and-role a line is, whichever end said it. */
function edgeKey(edge: Pick<FieldEdge, 'from' | 'to' | 'role'>): string {
  if (edge.role === 'partner') {
    const ends = [edge.from, edge.to].sort();
    return `partner|${ends[0]}|${ends[1]}`;
  }
  return `${edge.role}|${edge.from}|${edge.to}`;
}

/**
 * One line per pair per role.
 *
 * Because the server mirrors (writing "Kinderen: B" on A fills A into B's
 * "Ouders"), the same kinship is read twice — once off each artikel — and the
 * two readings are the *same line*, so the second is dropped and the first keeps
 * its label and its `fieldKey`. Which one is first is decided by the order the
 * graph walks its members, which is deterministic.
 *
 * A `parent` line collapses on `from`/`to` because `edgesFromFields` has already
 * turned both halves into parent → child. A `partner` line collapses on the
 * sorted ends, because it has no direction. A `kin` line is not mirrored at all,
 * so only an exact repeat of the same direction collapses — "A is een aspect van
 * B" and "B is een aspect van A" are two different claims and both are drawn.
 */
export function dedupeEdges<T extends Pick<FieldEdge, 'from' | 'to' | 'role'>>(edges: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const edge of edges ?? []) {
    const key = edgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(edge);
  }
  return out;
}
