import { describe, expect, it } from 'vitest';
import {
  CLUSTER_RADIUS,
  clusterPins,
  compareDrawOrder,
  inDrawOrder,
  LAYER_LIMIT,
  layerAfter,
  viewForCluster,
  type ClusterPin,
} from '@/lib/maps/cluster';

/**
 * §71 — de laag van een speld en het kluitje.
 *
 * De landkaart telt in breuken van de plaat, dus elke som hieronder gaat over
 * een plaat van 1000 × 1000 pixels: een breuk van 0,01 is dan 10 plaatpixels,
 * en bij zoom 1 ook 10 schermpixels.
 */
const PICTURE = { width: 1000, height: 1000 };

function pin(id: string, x: number, y: number, layer = 0, createdAt = 100): ClusterPin {
  return { id, x, y, layer, createdAt };
}

describe('compareDrawOrder', () => {
  it('legt een hogere laag voor een lagere', () => {
    expect(compareDrawOrder(pin('a', 0, 0, 0), pin('b', 0, 0, 3))).toBeLessThan(0);
    expect(compareDrawOrder(pin('a', 0, 0, 3), pin('b', 0, 0, 0))).toBeGreaterThan(0);
  });

  it('legt bij gelijke laag de nieuwste voor — dáárom begint een nieuwe speld op 0', () => {
    const oud = pin('a', 0, 0, 0, 100);
    const nieuw = pin('b', 0, 0, 0, 200);
    expect(compareDrawOrder(oud, nieuw)).toBeLessThan(0);
    expect(inDrawOrder([oud, nieuw]).at(-1)?.id).toBe('b');
  });

  it('een laag telt zwaarder dan een tijdstip: een oud dorp blijft boven een nieuw huis', () => {
    const dorp = pin('dorp', 0, 0, 2, 100);
    const huis = pin('huis', 0, 0, 0, 999);
    expect(inDrawOrder([huis, dorp]).at(-1)?.id).toBe('dorp');
  });

  it('is totaal: gelijke laag én gelijk tijdstip valt op het id', () => {
    expect(compareDrawOrder(pin('a', 0, 0, 0, 5), pin('b', 0, 0, 0, 5))).toBeLessThan(0);
    expect(compareDrawOrder(pin('b', 0, 0, 0, 5), pin('a', 0, 0, 0, 5))).toBeGreaterThan(0);
    expect(compareDrawOrder(pin('a', 0, 0, 0, 5), pin('a', 0, 0, 0, 5))).toBe(0);
  });

  it('sorteert dezelfde spelden op elk scherm hetzelfde, in welke volgorde ze ook binnenkomen', () => {
    const pins = [pin('c', 0, 0, 1, 5), pin('a', 0, 0, 1, 5), pin('b', 0, 0, 2, 9), pin('d', 0, 0, 0, 1)];
    const one = inDrawOrder(pins).map((p) => p.id);
    const two = inDrawOrder([...pins].reverse()).map((p) => p.id);
    expect(one).toEqual(two);
    expect(one).toEqual(['d', 'a', 'c', 'b']);
  });
});

describe('clusterPins', () => {
  it('laat spelden die ver uit elkaar staan met rust', () => {
    const groups = clusterPins([pin('a', 0.1, 0.1), pin('b', 0.9, 0.9)], { zoom: 1, picture: PICTURE });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.count === 0)).toBe(true);
  });

  it('voegt twee spelden op één plek samen tot één, met +1', () => {
    const groups = clusterPins([pin('a', 0.5, 0.5), pin('b', 0.5, 0.5)], { zoom: 1, picture: PICTURE });
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  it('de hoogste laag draagt het kluitje — Middelharnis (+10), niet het tiende huis', () => {
    const dorp = pin('middelharnis', 0.5, 0.5, 5, 1);
    const huizen = Array.from({ length: 10 }, (_, i) => pin(`huis-${i}`, 0.5 + i * 0.0005, 0.5, 0, 100 + i));
    const groups = clusterPins([...huizen, dorp], { zoom: 1, picture: PICTURE });
    expect(groups).toHaveLength(1);
    expect(groups[0].lead.id).toBe('middelharnis');
    expect(groups[0].count).toBe(10);
  });

  it('een andere laag geeft een andere kop, met dezelfde spelden', () => {
    const a = pin('a', 0.5, 0.5, 0, 1);
    const b = pin('b', 0.5, 0.5, 0, 2);
    expect(clusterPins([a, b], { zoom: 1, picture: PICTURE })[0].lead.id).toBe('b');
    expect(clusterPins([{ ...a, layer: 3 }, b], { zoom: 1, picture: PICTURE })[0].lead.id).toBe('a');
  });

  it('gaat bij verder inzoomen weer uit elkaar — niets verdwijnt, het gaat alleen samen', () => {
    // 30 plaatpixels uit elkaar: bij zoom 1 binnen de straal, bij zoom 4 niet.
    const pins = [pin('a', 0.5, 0.5), pin('b', 0.53, 0.5)];
    expect(clusterPins(pins, { zoom: 1, picture: PICTURE })).toHaveLength(1);
    expect(clusterPins(pins, { zoom: 4, picture: PICTURE })).toHaveLength(2);
  });

  it('telt elke speld precies één keer, hoe dicht ze ook liggen', () => {
    const pins = Array.from({ length: 25 }, (_, i) => pin(`p${i}`, 0.5 + (i % 5) * 0.004, 0.5 + Math.floor(i / 5) * 0.004, i % 3, i));
    const groups = clusterPins(pins, { zoom: 1, picture: PICTURE });
    const seen = groups.flatMap((g) => [g.lead.id, ...g.others.map((o) => o.id)]);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toHaveLength(25);
  });

  it('schuiven verandert niets — het rooster hangt aan de plaat, niet aan de pan', () => {
    const pins = [pin('a', 0.5, 0.5), pin('b', 0.505, 0.5)];
    // `tx`/`ty` komen niet in de aanroep voor; dat is de hele garantie.
    const one = clusterPins(pins, { zoom: 1.7, picture: PICTURE });
    const two = clusterPins([...pins].reverse(), { zoom: 1.7, picture: PICTURE });
    expect(one.map((g) => g.lead.id)).toEqual(two.map((g) => g.lead.id));
  });

  it('geeft de groepen terug van achter naar voren', () => {
    const groups = clusterPins(
      [pin('laag', 0.1, 0.1, 0), pin('hoog', 0.9, 0.9, 9), pin('midden', 0.5, 0.5, 4)],
      { zoom: 1, picture: PICTURE },
    );
    expect(groups.map((g) => g.lead.id)).toEqual(['laag', 'midden', 'hoog']);
  });

  it('de rest van een groep staat ook in tekenvolgorde', () => {
    const groups = clusterPins(
      [pin('a', 0.5, 0.5, 2, 1), pin('b', 0.5, 0.5, 0, 1), pin('c', 0.5, 0.5, 1, 1)],
      { zoom: 1, picture: PICTURE },
    );
    expect(groups[0].lead.id).toBe('a');
    expect(groups[0].others.map((o) => o.id)).toEqual(['b', 'c']);
  });

  it('geeft het vakje om de groep heen, in breuken van de plaat', () => {
    const groups = clusterPins([pin('a', 0.5, 0.5, 1), pin('b', 0.52, 0.51)], { zoom: 1, picture: PICTURE });
    expect(groups).toHaveLength(1);
    expect(groups[0].bounds).toEqual({ minX: 0.5, minY: 0.5, maxX: 0.52, maxY: 0.51 });
  });

  it('een losse speld heeft een vakje van niks op zijn eigen punt', () => {
    const [group] = clusterPins([pin('a', 0.25, 0.75)], { zoom: 1, picture: PICTURE });
    expect(group.bounds).toEqual({ minX: 0.25, minY: 0.75, maxX: 0.25, maxY: 0.75 });
  });

  it('slokt nooit op wat er vastgehouden wordt', () => {
    const groups = clusterPins([pin('a', 0.5, 0.5, 9), pin('b', 0.5, 0.5, 0)], {
      zoom: 1,
      picture: PICTURE,
      keep: new Set(['b']),
    });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.count === 0)).toBe(true);
  });

  it('een vastgehouden speld is zijn eigen kop, ook met een hogere ernaast', () => {
    const groups = clusterPins([pin('hoog', 0.5, 0.5, 9), pin('mijn', 0.5, 0.5, 0), pin('derde', 0.5, 0.5, 1)], {
      zoom: 1,
      picture: PICTURE,
      keep: new Set(['mijn']),
    });
    const leads = groups.map((g) => g.lead.id);
    expect(leads).toContain('mijn');
    expect(groups.find((g) => g.lead.id === 'mijn')?.count).toBe(0);
    expect(groups.find((g) => g.lead.id === 'hoog')?.count).toBe(1);
  });

  it('valt terug op los, nooit stiekem samen, bij onzin', () => {
    const pins = [pin('a', 0.5, 0.5), pin('b', 0.5, 0.5)];
    expect(clusterPins(pins, { zoom: 0, picture: PICTURE })).toHaveLength(2);
    expect(clusterPins(pins, { zoom: 1, picture: { width: 0, height: 0 } })).toHaveLength(2);
    expect(clusterPins(pins, { zoom: 1, picture: PICTURE, radius: 0 })).toHaveLength(2);
    expect(clusterPins(pins, { zoom: Number.NaN, picture: PICTURE })).toHaveLength(2);
    expect(clusterPins(pins, { zoom: -3, picture: PICTURE })).toHaveLength(2);
  });

  it('een lege landkaart geeft een lege lijst', () => {
    expect(clusterPins([], { zoom: 1, picture: PICTURE })).toEqual([]);
  });

  it('gebruikt standaard de straal die de tekening ook gebruikt', () => {
    const net = (CLUSTER_RADIUS - 2) / PICTURE.width;
    const nietMeer = (CLUSTER_RADIUS + 4) / PICTURE.width;
    expect(clusterPins([pin('a', 0.5, 0.5), pin('b', 0.5 + net, 0.5)], { zoom: 1, picture: PICTURE })).toHaveLength(1);
    expect(
      clusterPins([pin('a', 0.5, 0.5), pin('b', 0.5 + nietMeer, 0.5)], { zoom: 1, picture: PICTURE }),
    ).toHaveLength(2);
  });
});

describe('viewForCluster', () => {
  const stage = { w: 800, h: 600 };
  const current = { zoom: 1, tx: 0, ty: 0 };

  it('zet het midden van de groep in het midden van het glas', () => {
    const next = viewForCluster(
      { minX: 0.4, minY: 0.4, maxX: 0.6, maxY: 0.6 },
      PICTURE,
      stage,
      current,
      { maxZoom: 8 },
    );
    expect(next.tx + 500 * next.zoom).toBeCloseTo(stage.w / 2, 6);
    expect(next.ty + 500 * next.zoom).toBeCloseTo(stage.h / 2, 6);
  });

  it('zoomt altijd minstens één stap in, ook als de groep al ruim in beeld past', () => {
    const next = viewForCluster({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, PICTURE, stage, { zoom: 2, tx: 0, ty: 0 }, {
      step: 1.25,
      maxZoom: 8,
    });
    expect(next.zoom).toBeCloseTo(2.5, 6);
  });

  it('blijft eindig bij spelden op precies dezelfde plek, en doet dan die ene stap', () => {
    // Geen zoom haalt twee spelden op één punt uit elkaar, dus "passend maken"
    // heeft hier geen antwoord. Eén stap, en niet meteen tegen het plafond.
    const next = viewForCluster({ minX: 0.5, minY: 0.5, maxX: 0.5, maxY: 0.5 }, PICTURE, stage, current, {
      step: 1.25,
      maxZoom: 8,
    });
    expect(Number.isFinite(next.zoom)).toBe(true);
    expect(next.zoom).toBeCloseTo(1.25, 6);
  });

  it('gaat nooit door het plafond heen', () => {
    const next = viewForCluster({ minX: 0.5, minY: 0.5, maxX: 0.5001, maxY: 0.5001 }, PICTURE, stage, current, {
      step: 1.25,
      maxZoom: 8,
    });
    expect(next.zoom).toBe(8);
  });

  it('kiest de zoom waarop de groep met lucht eromheen past', () => {
    // 200 plaatpixels breed, 100 hoog; 800 × 600 glas met 80 px lucht rondom.
    const next = viewForCluster({ minX: 0.4, minY: 0.45, maxX: 0.6, maxY: 0.55 }, PICTURE, stage, current, {
      padding: 80,
      step: 1.25,
      maxZoom: 8,
    });
    expect(next.zoom).toBeCloseTo(Math.min(640 / 200, 440 / 100), 6);
  });

  it('komt nooit onder de vloer die de landkaart meegeeft', () => {
    const next = viewForCluster({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, PICTURE, stage, { zoom: 0.01, tx: 0, ty: 0 }, {
      minZoom: 0.5,
      maxZoom: 8,
    });
    expect(next.zoom).toBeGreaterThanOrEqual(0.5);
  });
});

describe('layerAfter', () => {
  const a = { id: 'a', layer: 0 };
  const b = { id: 'b', layer: 3 };
  const c = { id: 'c', layer: -2 };
  const all = [a, b, c];

  it('Naar voren is één omhoog, Naar achter één omlaag', () => {
    expect(layerAfter('forward', a, all)).toBe(1);
    expect(layerAfter('backward', a, all)).toBe(-1);
  });

  it('Voorgrond gaat één boven de hoogste die er verder ligt', () => {
    expect(layerAfter('front', a, all)).toBe(4);
  });

  it('Achtergrond gaat één onder de laagste die er verder ligt', () => {
    expect(layerAfter('back', a, all)).toBe(-3);
  });

  it('Voorgrond haalt nooit naar achteren, Achtergrond nooit naar voren', () => {
    expect(layerAfter('front', b, all)).toBe(3);
    expect(layerAfter('back', c, all)).toBe(-2);
  });

  it('laat een speld die alleen op de landkaart staat waar hij is', () => {
    expect(layerAfter('front', a, [a])).toBe(0);
    expect(layerAfter('back', a, [a])).toBe(0);
  });

  it('kapt af, zodat honderd keer drukken geen getal geeft waar niets boven kan', () => {
    const top = { id: 'a', layer: LAYER_LIMIT };
    expect(layerAfter('forward', top, [top, b])).toBe(LAYER_LIMIT);
    const bottom = { id: 'a', layer: -LAYER_LIMIT };
    expect(layerAfter('backward', bottom, [bottom, b])).toBe(-LAYER_LIMIT);
  });

  it('brengt een speld die Voorgrond kreeg ook echt naar voren in de volgorde', () => {
    const pins = [pin('a', 0.5, 0.5, 0, 1), pin('b', 0.5, 0.5, 0, 2)];
    expect(clusterPins(pins, { zoom: 1, picture: PICTURE })[0].lead.id).toBe('b');
    const next = layerAfter('front', pins[0], pins);
    const after = clusterPins([{ ...pins[0], layer: next }, pins[1]], { zoom: 1, picture: PICTURE });
    expect(after[0].lead.id).toBe('a');
  });
});
