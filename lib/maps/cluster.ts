/**
 * §71 — de laag van een speld, en wat er gebeurt als spelden op een kluitje staan.
 *
 * Twee dingen die één ding zijn. Elke speld draagt een `layer`: een geheel
 * getal dat zegt hoe ver naar voren hij staat. Dat getal doet twee klussen —
 *
 *  1. **De tekenvolgorde.** Hoger ligt over lager heen.
 *  2. **Wie de troep vertegenwoordigt.** Staan er bij deze zoom vijf spelden
 *     binnen een duimbreedte van elkaar, dan wordt er één getekend, met een
 *     `+4` ernaast, en dat is degene met de hoogste laag. Middelharnis (+10),
 *     niet het tiende huis (+10).
 *
 * De rang is **per speld**, niet per soort (Nick, ronde 36): op de ene
 * landkaart gaat een dorp boven een huis, op de andere gaat de kamer boven
 * alles omdat de kamer het onderwerp is. Er wordt dus niets afgeleid uit
 * `entry_types`; de hand die de speld zet zegt het, met Naar voren / Naar
 * achter / Voorgrond / Achtergrond.
 *
 * **Niets verdwijnt ooit.** Er is geen zoomband waarop een soort wegvalt: een
 * speld die er gewoon niet is leest als een storing, en een lezer die weet dat
 * er een huis staat gaat zoeken in plaats van klikken. Spelden gaan alleen
 * samen, en de `+n` zegt hoeveel. Eén klik op dat cijfertje zoomt precies zo
 * ver in dat die groep het glas vult — en dan staan ze weer los.
 *
 * Waarom hier en niet in `MapCanvas.tsx`: dit is meetkunde, en meetkunde woont
 * in een zuiver bestand met tests (§5, dezelfde regel waar het web, de tijdlijn
 * en de stamboom van leven). Geen React, geen database.
 *
 * **De eenheid.** Een speld staat opgeslagen als een breuk van de plaat (0–1),
 * want de plaat schaalt mee en de speldenkop niet. Of twee spelden op een
 * kluitje staan is echter een vraag over het *scherm*: bij zoom 8 staan twee
 * spelden die bij zoom 0,5 op elkaar lagen ruim uit elkaar. De straal hieronder
 * is daarom in schermpixels, en de som gaat via de plaatbreedte × zoom.
 * `tx`/`ty` doen níet mee: schuiven verandert niets aan wie bij wie hoort, en
 * een rooster dat met de pan meeschuift laat groepen knipperen onder je hand.
 */

/** Wat de rekenkunde van een speld hoeft te weten. */
export type ClusterPin = {
  id: string;
  /** Breuk van de plaat, 0–1. */
  x: number;
  /** Breuk van de plaat, 0–1. */
  y: number;
  /** §71: hoger ligt voor. */
  layer: number;
  /** Seconden; de tiebreak, zodat de volgorde totaal is. */
  createdAt: number;
};

/** De plaat, in pixels — `maps.width` / `maps.height`. */
export type Picture = { width: number; height: number };

/** Een vakje in breuken van de plaat. */
export type PinBounds = { minX: number; minY: number; maxX: number; maxY: number };

export type PinCluster<T extends ClusterPin> = {
  /** Degene die getekend wordt: de hoogste laag van de groep. */
  lead: T;
  /** De rest, in tekenvolgorde (laag → hoog). Leeg voor een losse speld. */
  others: T[];
  /** `others.length` — wat er als `+n` naast komt te staan. */
  count: number;
  /** Het vakje om de hele groep heen, in breuken van de plaat. */
  bounds: PinBounds;
};

/**
 * Hoe dicht twee spelden op het scherm bij elkaar moeten staan om samen te
 * gaan, in schermpixels. Een speldenkop is 28 px breed (`PIN_HALF_PX` × 2 in
 * `MapCanvas.tsx`), dus onder de 36 px overlappen de koppen elkaar al.
 */
export const CLUSTER_RADIUS = 36;

/**
 * De totale volgorde van spelden, van achter naar voren.
 *
 * Drie trappen, en alle drie zijn ze nodig:
 *
 *  - **laag**, want dat is waar het getal voor is;
 *  - **`createdAt` oplopend**, dus de nieuwste ligt vóór zijn gelijken. Dat is
 *    ook meteen het antwoord op "waar begint een nieuwe speld?" — op 0, net als
 *    alle andere, en tóch bovenop de spelden waar hij tussen komt te staan. Een
 *    nieuwe speld op `max + 1` zetten zou hem boven het dorp tillen waar hij
 *    net in gezet is, en dan moet je elke keer handmatig terug;
 *  - **id**, zodat twee spelden die in dezelfde seconde gezet zijn op élk
 *    scherm dezelfde volgorde krijgen. Een volgorde die per browser verschilt
 *    is een `+n` die ergens anders een andere naam draagt.
 */
export function compareDrawOrder(a: ClusterPin, b: ClusterPin): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Van achter naar voren: wat als laatste getekend wordt, ligt bovenop. */
export function inDrawOrder<T extends ClusterPin>(pins: readonly T[]): T[] {
  return [...pins].sort(compareDrawOrder);
}

function finite(n: number, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function boundsOf(pins: readonly ClusterPin[]): PinBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pin of pins) {
    const x = finite(pin.x, 0);
    const y = finite(pin.y, 0);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/**
 * Wie hoort er bij wie, bij deze zoom?
 *
 * Gulzig en van voren naar achteren: de hoogste speld die nog niet vergeven is
 * wordt de kop van een groep en pakt elke nog vrije speld binnen de straal. Dat
 * is met opzet geen rooster met vakjes — een rooster knipt twee spelden die
 * tegen elkaar aan staan uit elkaar zodra de vakgrens er toevallig tussendoor
 * loopt, en dan staat er een `+1` naast een speld waar niets naast staat. Het
 * rooster hieronder is alleen een zoekhulp voor de buren, niet de indeling zelf.
 *
 * `keep` is voor spelden die nooit opgeslokt mogen worden: wat er gekozen is en
 * wat er op dit moment gesleept wordt. Een speld die je vasthoudt en die onder
 * een `+3` verdwijnt omdat hij toevallig langs een ander kwam, is een speld die
 * je kwijt bent.
 */
export function clusterPins<T extends ClusterPin>(
  pins: readonly T[],
  options: {
    zoom: number;
    picture: Picture;
    /** Schermpixels; standaard `CLUSTER_RADIUS`. */
    radius?: number;
    /** Ids die altijd hun eigen kop zijn. */
    keep?: ReadonlySet<string>;
  },
): PinCluster<T>[] {
  const ordered = inDrawOrder(pins);
  const zoom = options.zoom;
  const width = finite(options.picture.width, 0);
  const height = finite(options.picture.height, 0);
  const radius = finite(options.radius ?? CLUSTER_RADIUS, CLUSTER_RADIUS);
  const keep = options.keep ?? new Set<string>();

  // Geen straal, geen plaat of geen zoom: iedereen los. Nooit stiekem samen.
  if (!Number.isFinite(zoom) || radius <= 0 || zoom <= 0 || width <= 0 || height <= 0) {
    return ordered.map((pin) => ({ lead: pin, others: [], count: 0, bounds: boundsOf([pin]) }));
  }

  /** Breuk van de plaat → schermpixel, bij deze zoom. */
  const sx = (pin: T) => finite(pin.x, 0) * width * zoom;
  const sy = (pin: T) => finite(pin.y, 0) * height * zoom;

  // Zoekhulp: vakjes zo groot als de straal, dus de buren liggen in 3×3.
  const grid = new Map<string, T[]>();
  const cellOf = (pin: T) => `${Math.floor(sx(pin) / radius)}:${Math.floor(sy(pin) / radius)}`;
  for (const pin of ordered) {
    const key = cellOf(pin);
    const cell = grid.get(key);
    if (cell) cell.push(pin);
    else grid.set(key, [pin]);
  }

  const taken = new Set<string>();
  const groups: PinCluster<T>[] = [];
  const descending = [...ordered].reverse();
  /*
   * Wat vastgehouden wordt staat helemaal buiten de indeling: het slokt niets
   * op en het wordt niet opgeslokt. Een gekozen speld is dus altijd precies
   * zichzelf — en de spelden eromheen doen alsof hij er niet is, want anders
   * zou het kiezen van één speld de `+n` van zijn buren veranderen.
   */
  const candidates = [
    ...descending.filter((pin) => keep.has(pin.id)),
    ...descending.filter((pin) => !keep.has(pin.id)),
  ];

  for (const lead of candidates) {
    if (taken.has(lead.id)) continue;
    taken.add(lead.id);
    if (keep.has(lead.id)) {
      groups.push({ lead, others: [], count: 0, bounds: boundsOf([lead]) });
      continue;
    }
    const cx = Math.floor(sx(lead) / radius);
    const cy = Math.floor(sy(lead) / radius);
    const members: T[] = [];
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        for (const other of grid.get(`${gx}:${gy}`) ?? []) {
          if (taken.has(other.id) || keep.has(other.id)) continue;
          if (Math.hypot(sx(other) - sx(lead), sy(other) - sy(lead)) > radius) continue;
          taken.add(other.id);
          members.push(other);
        }
      }
    }
    members.sort(compareDrawOrder);
    groups.push({
      lead,
      others: members,
      count: members.length,
      bounds: boundsOf([lead, ...members]),
    });
  }

  // Van achter naar voren, op de kop van elke groep.
  groups.sort((a, b) => compareDrawOrder(a.lead, b.lead));
  return groups;
}

/** Waar de glasplaat staat: hetzelfde `View` dat `MapCanvas` gebruikt. */
export type MapView = { zoom: number; tx: number; ty: number };

/**
 * Eén klik op een `+n`: zoom in tot precies deze groep het glas vult, en zet
 * hem in het midden. Geen zwevend lijstje, geen tweede scherm — je ziet ze
 * gewoon uit elkaar gaan, en dat is het antwoord op "hoeveel zijn het er".
 *
 * Twee vangnetten, en allebei doen ze ertoe:
 *
 *  - Staan de spelden pixel op pixel op elkaar, dan is het vakje nul bij nul en
 *    zou "passend maken" oneindig ver inzoomen. Het plafond vangt dat.
 *  - En er gaat altijd mínstens één stap in (`step`), ook als de groep al ruim
 *    in beeld zou passen. Een klik waar niets van beweegt leest als stuk.
 */
export function viewForCluster(
  bounds: PinBounds,
  picture: Picture,
  stage: { w: number; h: number },
  current: MapView,
  options: { padding?: number; step?: number; minZoom?: number; maxZoom?: number } = {},
): MapView {
  const padding = finite(options.padding ?? 80, 80);
  const step = Math.max(1, finite(options.step ?? 1.25, 1.25));
  const maxZoom = finite(options.maxZoom ?? 8, 8);
  const minZoom = finite(options.minZoom ?? 0, 0);
  const width = finite(picture.width, 0);
  const height = finite(picture.height, 0);
  const stageW = Math.max(1, finite(stage.w, 0));
  const stageH = Math.max(1, finite(stage.h, 0));

  const boxW = Math.max(0, finite(bounds.maxX, 0) - finite(bounds.minX, 0)) * width;
  const boxH = Math.max(0, finite(bounds.maxY, 0) - finite(bounds.minY, 0)) * height;
  const room = { w: Math.max(1, stageW - padding * 2), h: Math.max(1, stageH - padding * 2) };
  const fit = Math.min(
    boxW > 0 ? room.w / boxW : Infinity,
    boxH > 0 ? room.h / boxH : Infinity,
  );

  /*
   * Ligt de hele groep op één punt, dan is er geen zoom die ze uit elkaar haalt
   * en heeft "passend maken" geen antwoord (`fit` is oneindig). Dan blijft het
   * bij die ene stap: er beweegt iets, en dat is het eerlijkste dat er is.
   */
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.max(finite(current.zoom, 1) * step, Number.isFinite(fit) ? fit : 0)),
  );
  const cx = ((finite(bounds.minX, 0) + finite(bounds.maxX, 0)) / 2) * width;
  const cy = ((finite(bounds.minY, 0) + finite(bounds.maxY, 0)) / 2) * height;
  return { zoom, tx: stageW / 2 - cx * zoom, ty: stageH / 2 - cy * zoom };
}

/**
 * De vier bevelen, als rekensom.
 *
 * Bewust de simpelste die klopt: één stap is één, en Voorgrond / Achtergrond
 * gaan één voorbij wat er nu het hoogste respectievelijk het laagste ligt. Er
 * is met opzet niet gezocht naar "de eerstvolgende laag boven mij" — dat leest
 * mooi in een lijstje van drie en is niet uit te leggen zodra er twee spelden
 * op dezelfde laag staan, en het is ook niet wat een tekenprogramma doet.
 *
 * Het antwoord wordt afgekapt op `LAYER_LIMIT`, zodat honderd keer drukken geen
 * getal oplevert waar niets meer boven kan.
 */
export const LAYER_LIMIT = 999;

export type LayerCommand = 'forward' | 'backward' | 'front' | 'back';

export function layerAfter(
  command: LayerCommand,
  pin: { id: string; layer: number },
  all: readonly { id: string; layer: number }[],
): number {
  const others = all.filter((one) => one.id !== pin.id).map((one) => finite(one.layer, 0));
  const mine = finite(pin.layer, 0);
  let next: number;
  if (command === 'forward') next = mine + 1;
  else if (command === 'backward') next = mine - 1;
  // Voorgrond haalt nooit naar achteren: wie al bovenaan ligt, blijft liggen.
  else if (command === 'front') next = others.length ? Math.max(mine, Math.max(...others) + 1) : mine;
  else next = others.length ? Math.min(mine, Math.min(...others) - 1) : mine;
  return Math.round(Math.min(LAYER_LIMIT, Math.max(-LAYER_LIMIT, next)));
}
