import { roleFieldsOf, type RoleFieldSource } from './roles';
import type { SiblingKind } from './types';

/**
 * §67 — broers en zussen, afgeleid en getypt.
 *
 * Round 31 gave a stamboom three kinship fields and no fourth: brothers and
 * sisters were not written down anywhere, because they are not a fact of their
 * own. Two people with the same parents *are* siblings, and nobody should have
 * to type that on four pages so that a tree can draw a line. So the archive
 * works it out — and keeps one typed field, `Broers en zussen`, for the case
 * the derivation cannot reach: the parents are unknown, or unrecorded, and
 * somebody still knows the two belong together.
 *
 * This file is the whole of the working-out, and it is pure: no database, no
 * viewer, no React. `buildFamilyGraph` (`lib/families/graph.ts`) feeds it the
 * parents of the artikelen it is *drawing*, and `siblingsOf`
 * (`lib/families/service.ts`) feeds it the parents of one artikel's neighbours;
 * both have already filtered on `visibleEntryCondition`, so a parent this
 * reader may not see is simply not in the map — and two half-siblings can read
 * as full ones on a player's screen, which is rule 1 doing its job rather than
 * a bug.
 *
 * The three verdicts, and the reasoning behind each:
 *
 *   **full**    – both parent sets are equal and hold two parents. Two is the
 *                 floor on purpose: one shared parent and nothing else recorded
 *                 is not proof of anything, because the second parent of each
 *                 may simply never have been typed in.
 *   **half**    – each side has a recorded parent the other lacks, and they
 *                 still share at least one. That is the one shape where the
 *                 archive really does know they are half-siblings.
 *   **unknown** – they share a parent and one set is contained in the other
 *                 (one child has a mother recorded, the other a mother and a
 *                 father). Almost certainly siblings; the archive does not know
 *                 of which kind, and says so rather than guessing.
 *
 * Sharing no parent at all is not a verdict — it is no line.
 */

/** A verdict the archive worked out for itself. `explicit` is not one of these. */
export type DerivedSiblingKind = Extract<SiblingKind, 'full' | 'half' | 'unknown'>;

/** One derived pair, `a` always the lower id so a pair has one spelling. */
export type DerivedSibling = { a: string; b: string; kind: DerivedSiblingKind };

/**
 * §67: the word printed on a chip's little tag, on the artikel and anywhere
 * else a verdict is shown. Dutch, lowercase, one word — it sits beside a name,
 * not above a column. `explicit` is "genoteerd": somebody typed it, and that is
 * a different kind of knowing from the other three.
 */
export const SIBLING_WORDS: Record<SiblingKind, string> = {
  full: 'vol',
  half: 'half',
  unknown: 'onbekend',
  explicit: 'genoteerd',
};

/** The one spelling of a pair, whichever end asked. */
export function pairKey(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * The FIRST parent-role field of a soort — the one the mirror writes into
 * (`mirrorPlan`), and the only one siblings are derived from.
 *
 * That restriction is the whole reason this function exists. A god carries both
 * `ouders` and `geschapen_door`, and both are `role: 'parent'`: derive from
 * every parent-role field and **every creature of one god becomes a brother of
 * every other**, which is a hairball, not a family. Scheppen is parenthood with
 * another word on it for the purpose of *drawing a line*, not for the purpose
 * of working out who is somebody's sister. One field, chosen once, the same one
 * the mirror fills in — and a Keeper who disagrees moves the fields in Beheer,
 * exactly as they would to change what the mirror writes.
 */
export function primaryParentField(defs: readonly RoleFieldSource[]): string | null {
  for (const field of roleFieldsOf(defs)) {
    if (field.role === 'parent') return field.key;
  }
  return null;
}

/**
 * Every pair that shares a parent, with what the archive can honestly say about
 * them. `parentsOf` is child id → the ids of its recorded parents; anybody with
 * no recorded parent is in no pair at all.
 *
 * Deterministic: the pairs come back sorted, and each pair's ends are sorted,
 * so the same map always gives the same list in the same order.
 */
export function classifySiblings(
  parentsOf: ReadonlyMap<string, ReadonlySet<string>>,
): DerivedSibling[] {
  const people = [...parentsOf.entries()]
    .filter(([id, parents]) => Boolean(id) && parents.size > 0)
    .map(([id, parents]) => ({ id, parents }))
    .sort((one, two) => (one.id < two.id ? -1 : one.id > two.id ? 1 : 0));

  /*
   * Only pairs that actually share a parent are looked at. Walking every pair
   * of a 400-member tree is 80 000 comparisons that almost all answer "no"; an
   * index on the parent turns it into "the children of one parent", which is
   * the size of a family.
   */
  const byId = new Map(people.map((one) => [one.id, one]));
  const byParent = new Map<string, string[]>();
  for (const one of people) {
    for (const parent of one.parents) {
      const held = byParent.get(parent);
      if (held) held.push(one.id);
      else byParent.set(parent, [one.id]);
    }
  }
  const pairs = new Set<string>();
  for (const children of byParent.values()) {
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) pairs.add(pairKey(children[i], children[j]));
    }
  }

  const ordered = [...pairs]
    .map((key) => key.split('|') as [string, string])
    .sort((one, two) => (one[0] < two[0] ? -1 : one[0] > two[0] ? 1 : one[1] < two[1] ? -1 : 1));

  const out: DerivedSibling[] = [];
  for (const [aId, bId] of ordered) {
    const one = byId.get(aId);
    const two = byId.get(bId);
    if (!one || !two) continue;
    let shared = 0;
    for (const parent of one.parents) if (two.parents.has(parent)) shared++;
    // No parent in common is no relation this file knows how to name. (The
    // index above only makes pairs that share one, so this is a belt.)
    if (!shared) continue;

    const oneOnly = one.parents.size - shared;
    const twoOnly = two.parents.size - shared;
    const kind: DerivedSiblingKind =
      oneOnly === 0 && twoOnly === 0
        ? // The same parents on both pages. Two of them is a full sibling; one
          // of them is a single recorded mother twice over, which says nothing
          // about the fathers.
          one.parents.size >= 2
          ? 'full'
          : 'unknown'
        : oneOnly > 0 && twoOnly > 0
          ? 'half'
          : // One set inside the other: the shorter page is simply less filled
            // in, not proof of a different second parent.
            'unknown';
    out.push({ a: one.id, b: two.id, kind });
  }
  return out;
}

/** What the graph should draw for one pair, after the two readings are weighed. */
export type SiblingVerdict = {
  /** The lower id of the pair. */
  a: string;
  b: string;
  /** `explicit` when a typed field said it; otherwise the derived verdict. */
  kind: SiblingKind;
  source: 'explicit' | 'derived';
  /**
   * §67: an explicit claim the recorded parents contradict — both sides have a
   * parent written down and they share none. Kept and drawn: a Keeper's typed
   * field is never silently dropped. The canvas may say so.
   */
  contested?: boolean;
};

/**
 * The two readings, weighed. Three rules, and they are the whole policy:
 *
 * 1. **An explicit link that derives as `full` is redundant** and is dropped
 *    from the drawing — never from the field. It is `yieldToLineage` in the web
 *    (`lib/web/slice.ts`) wearing a different hat: where two facts say the same
 *    thing, the stronger one is drawn and the weaker one steps aside, so the
 *    count, the panel and the picture agree. The derived line takes its place.
 * 2. **An explicit link the parents contradict is kept, and marked.** Both
 *    sides have a parent recorded and they share none: somebody typed something
 *    the rest of the archive disagrees with. Dropping it would be the archive
 *    overruling a person, so it is drawn with `contested: true` instead.
 * 3. **A derived line never duplicates an explicit one.** Where both readings
 *    reach the same pair and the explicit one survived rule 1, the explicit one
 *    wins: it keeps its id, its field's label and `kind: 'explicit'`, because
 *    that is the line a reader can click to take away.
 *
 * `parentsOf` is only read for rule 2 — pass it and contested pairs are marked;
 * leave it out and nothing is.
 */
export function reconcileSiblings(
  explicit: readonly { a: string; b: string }[],
  derived: readonly DerivedSibling[],
  parentsOf: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): SiblingVerdict[] {
  const derivedByPair = new Map<string, DerivedSibling>();
  for (const one of derived) derivedByPair.set(pairKey(one.a, one.b), one);

  const kept: SiblingVerdict[] = [];
  const claimed = new Set<string>();
  const seen = new Set<string>();

  for (const link of explicit) {
    if (!link || !link.a || !link.b || link.a === link.b) continue;
    const key = pairKey(link.a, link.b);
    if (seen.has(key)) continue;
    seen.add(key);
    const [a, b] = key.split('|');

    // Rule 1: the parents already say it, so the typed field steps aside.
    if (derivedByPair.get(key)?.kind === 'full') continue;

    // Rule 2: both sides have parents and share none — kept, and marked.
    const oneParents = parentsOf.get(a);
    const twoParents = parentsOf.get(b);
    let contested = false;
    if (oneParents?.size && twoParents?.size) {
      contested = ![...oneParents].some((parent) => twoParents.has(parent));
    }

    claimed.add(key);
    kept.push({ a, b, kind: 'explicit', source: 'explicit', ...(contested ? { contested: true } : {}) });
  }

  // Rule 3: everything the archive worked out that nobody typed.
  for (const one of derived) {
    const key = pairKey(one.a, one.b);
    if (claimed.has(key)) continue;
    const [a, b] = key.split('|');
    kept.push({ a, b, kind: one.kind, source: 'derived' });
  }

  return kept;
}
