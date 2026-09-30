/**
 * Golf M (herstel): welke lijnen van een stamboom opnieuw getekend moeten
 * worden terwijl een kaartje in de hand van een ander glijdt.
 *
 * `followLines` rekende elk animatieframe *alle* lijnen uit en zocht per lijn
 * drie keer in de DOM, ook de honderd die niet bewogen. Een lijn beweegt alleen
 * als een van haar uiteinden beweegt, of — voor een lijn van ouder naar kind —
 * als de balk waar ze aan hangt verschuift, en die balk volgt de *ouders* van
 * zijn verbintenis (`moveInLayout`). Dus: de verbintenissen met een bewegend lid,
 * en daarvan de lijnen die door die verbintenis lopen of een bewegend uiteinde
 * hebben. Puur.
 */

type EdgeLike = { from: string; to: string; role: string };
type UnionLike = { parents: readonly string[]; children: readonly string[] };

/** De verbintenissen waar iets aan beweegt: alleen die hoeven opnieuw uitgerekend. */
export function unionsTouching<U extends UnionLike>(unions: readonly U[], moved: ReadonlySet<string>): U[] {
  return unions.filter(
    (union) => union.parents.some((id) => moved.has(id)) || union.children.some((id) => moved.has(id)),
  );
}

/**
 * De lijnen die een verschuiving van `moved` raakt. Een `child`-lijn is een
 * `parent`-lijn andersom, zoals in `drawLines`.
 */
export function edgesTouching<E extends EdgeLike>(
  edges: readonly E[],
  unions: readonly UnionLike[],
  moved: ReadonlySet<string>,
): E[] {
  if (!moved.size) return [];
  /** Ouder|kind-paren onder een balk die verschuift (een ouder beweegt). */
  const underMovingBar = new Set<string>();
  for (const union of unions) {
    if (!union.parents.some((id) => moved.has(id))) continue;
    for (const parent of union.parents) for (const child of union.children) underMovingBar.add(`${parent}|${child}`);
  }
  return edges.filter((edge) => {
    if (moved.has(edge.from) || moved.has(edge.to)) return true;
    if (edge.role !== 'parent' && edge.role !== 'child') return false;
    const [parent, child] = edge.role === 'child' ? [edge.to, edge.from] : [edge.from, edge.to];
    return underMovingBar.has(`${parent}|${child}`);
  });
}
