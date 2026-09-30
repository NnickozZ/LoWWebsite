/**
 * Golf M: wie houdt welke speld vast — en waar de ring dan hoort.
 *
 * Tot golf M tekende de landkaart voor elke speld in iemand anders' hand een
 * **tweede speld**: een lege kop op dezelfde plek (`.map-held.map-pin`), zonder
 * pictogram en zonder naam. Omdat de echte speld zijn naamstrookje onder de kop
 * draagt en de lege niet, stonden die twee koppen zo'n twintig pixels uit
 * elkaar — "ineens twee spelden", zei Nick. En de lus liep over `shown`, niet
 * over de koppen van de kluitjes (§71), dus een speld die in een `+n` zat, kreeg
 * een eigen kop terwijl hijzelf niet getekend werd.
 *
 * Nu is het de ring van het prikbord (`.board-held`) en de stamboom
 * (`.tree-held`): **de echte speld** krijgt de kleur van de hand die hem
 * vasthoudt, en een speld die in een kluitje zit, zet die ring om het cijfertje.
 * Nooit een tweede speld.
 *
 * Puur, zodat de keus te testen is zonder component, en in een vorm die een
 * volgende golf (zachte sloten, gladde handen) op elk vlak kan hergebruiken:
 * een `Map` van id naar `Holder`, en voor de landkaart de verdeling over koppen
 * en cijfertjes.
 */

/** Wie iets vasthoudt: de naam op de lijn en de inkt van die hand. */
export type Holder = { name: string; colour: string };

/** Een persoon zoals de site-lijn hem kent (`live.people`), zover het hier telt. */
export type HoldingPerson = { clientId: string; name: string; colour: string; holding?: readonly string[] | null };

/**
 * Van de roster naar "id → wie". De eigen tab telt niet mee (de roster laat hem
 * er meestal al uit, niet elke bron doet dat), en bij twee handen op één ding
 * wint de eerste: gestapelde ringen zijn soep (§69 2.1).
 */
export function heldByOthers(people: readonly HoldingPerson[], selfClientId: string | null | undefined): Map<string, Holder> {
  const held = new Map<string, Holder>();
  for (const person of people) {
    if (selfClientId && person.clientId === selfClientId) continue;
    for (const id of person.holding ?? []) {
      if (!held.has(id)) held.set(id, { name: person.name, colour: person.colour });
    }
  }
  return held;
}

/** Een kluitje zoals `clusterPins` het teruggeeft, zover het hier telt. */
export type HeldCluster = { lead: { id: string }; others: readonly { id: string }[] };

/**
 * Waar de ring komt: om de kop van de speld zelf als die getekend wordt
 * (`pins`, op het id van de speld), en anders om het `+n` van het kluitje waar
 * hij in zit (`badges`, op het id van de kop van dat kluitje). Een speld die in
 * geen enkel kluitje staat (weggefilterd, of verborgen door de legenda) krijgt
 * niets: wat je niet ziet, kan niet vastgehouden getekend worden.
 */
export function heldMarks(
  clusters: readonly HeldCluster[],
  held: ReadonlyMap<string, Holder>,
): { pins: Map<string, Holder>; badges: Map<string, Holder> } {
  const pins = new Map<string, Holder>();
  const badges = new Map<string, Holder>();
  if (!held.size) return { pins, badges };
  for (const cluster of clusters) {
    const lead = held.get(cluster.lead.id);
    if (lead) pins.set(cluster.lead.id, lead);
    for (const other of cluster.others) {
      const holder = held.get(other.id);
      if (holder && !badges.has(cluster.lead.id)) badges.set(cluster.lead.id, holder);
    }
  }
  return { pins, badges };
}
