'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Follower, translateValue, type Vec } from '@/lib/canvas/follow';

/**
 * Golf M (samen): de volger aan het scherm — één voor alle vier de vlakken.
 *
 * React tekent een gedragen ding waar het laatste frame het heeft (het doel,
 * zoals altijd), en dit haakje zet er een `translate` bovenop: het verschil
 * tussen waar de veer (`lib/canvas/follow.ts`) het nu heeft en dat doel. Het
 * vlak zelf rendert dus niet zestig keer per seconde — alleen de stijl van de
 * paar elementen die gedragen worden, rechtstreeks, per animatieframe.
 *
 * Welke elementen: alles onder `root` met `data-follow="<prefix><id>"`. Een
 * kaartje en de ring eromheen dragen dezelfde sleutel en glijden samen; een
 * venster dat aan een tag hangt, glijdt mee als het hem ook draagt.
 *
 * `translate` en niet `transform`: de losse eigenschap stapelt vóór de
 * `transform` die een element al heeft (een kaartje is gedraaid, een
 * handje geschaald, een stamboomkaartje staat mét een transform op zijn plek),
 * en React raakt hem nooit aan, want geen enkele `style` hier noemt hem.
 *
 * Twee momenten schrijft het: in een layout-effect, meteen nadat React een
 * nieuw doel heeft neergezet en vóór de browser tekent — anders staat het ding
 * één beeld lang op zijn nieuwe doel en springt dan terug — en per
 * animatieframe, zolang er iets beweegt. Eén rAF-lus voor alle volgers samen.
 *
 * `prefers-reduced-motion`: dan volgt er niets en staat alles waar het frame
 * het zet.
 */

type Tick = (dtMs: number) => boolean;

const ticks = new Set<Tick>();
let rafId = 0;
let lastAt = 0;

function frame(now: number) {
  const dt = lastAt ? now - lastAt : 16;
  lastAt = now;
  for (const tick of [...ticks]) {
    if (!tick(dt)) ticks.delete(tick);
  }
  if (ticks.size) rafId = requestAnimationFrame(frame);
  else {
    rafId = 0;
    lastAt = 0;
  }
}

function wake(tick: Tick) {
  ticks.add(tick);
  if (!rafId && typeof requestAnimationFrame === 'function') {
    lastAt = 0;
    rafId = requestAnimationFrame(frame);
  }
}

function selectorFor(key: string): string {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
  return `[data-follow="${escaped}"]`;
}

/** Of deze kijker om minder beweging vroeg. Leest de voorkeur, en luistert als hij verandert. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

const NO_TARGETS: ReadonlyMap<string, Vec> = new Map();

export function useFollow({
  rootRef,
  targets,
  scale,
  prefix = '',
  onFrame,
}: {
  /** Waaronder de elementen met `data-follow` staan. */
  rootRef: RefObject<HTMLElement | null>;
  /**
   * Waar React elk gedragen ding nu tekent, in de eenheden van het vlak. Een
   * nieuwe `Map` als er iets veranderde, dezelfde als niet.
   */
  targets: ReadonlyMap<string, Vec> | null;
  /** Schermpixels per eenheid van het vlak, per as — waarmee de verschuiving geschreven wordt. */
  scale: Vec;
  /** Voor een tweede volger op hetzelfde vlak (de handjes): zijn sleutels beginnen hiermee. */
  prefix?: string;
  /**
   * Na elke schrijfbeurt: waar alles nu getekend staat. Voor wat geen
   * `translate` kan krijgen — een lijn van een stamboom, een draad op een
   * prikbord, die moeten hun eigen `d` herschrijven.
   */
  onFrame?: (visual: ReadonlyMap<string, Vec>, moving: boolean) => void;
}): { seed: (id: string, at: Vec) => void } {
  const followerRef = useRef<Follower | null>(null);
  if (!followerRef.current) followerRef.current = new Follower();
  const follower = followerRef.current;
  const reduced = useReducedMotion();
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  /** Welke sleutels een `translate` van ons kregen, zodat een weggevallen er een leeg krijgt. */
  const written = useRef<Map<string, string>>(new Map());

  const write = useCallback(() => {
    const root = rootRef.current;
    const now = scaleRef.current;
    const seen = new Set<string>();
    if (root) {
      for (const id of follower.ids()) {
        const key = `${prefix}${id}`;
        const value = translateValue(follower.offset(id, now));
        seen.add(key);
        const nodes = root.querySelectorAll<HTMLElement | SVGElement>(selectorFor(key));
        nodes.forEach((node) => {
          if (node.style.translate !== value) node.style.translate = value;
        });
        if (value) written.current.set(key, value);
        else written.current.delete(key);
      }
      for (const key of [...written.current.keys()]) {
        if (seen.has(key)) continue;
        root.querySelectorAll<HTMLElement | SVGElement>(selectorFor(key)).forEach((node) => {
          node.style.translate = '';
        });
        written.current.delete(key);
      }
    }
    onFrameRef.current?.(follower.visuals(), follower.moving());
  }, [follower, prefix, rootRef]);

  const tick = useRef<Tick | null>(null);
  if (!tick.current) {
    tick.current = (dt: number) => {
      const moving = follower.step(dt, scaleRef.current);
      write();
      return moving;
    };
  }

  const list = targets ?? NO_TARGETS;
  useLayoutEffect(() => {
    follower.retarget(list, scaleRef.current, performance.now());
    if (reduced) follower.snapAll();
    write();
    if (follower.moving() && tick.current) wake(tick.current);
  }, [list, scale.x, scale.y, reduced, follower, write]);

  /*
   * En na elke andere render ook: React kan een element opnieuw hebben
   * gemaakt (een kluitje dat uit elkaar viel, een tag die van baan wisselde),
   * en een nieuw element heeft onze `translate` nog niet. Goedkoop: alleen de
   * paar dingen die gedragen worden.
   */
  useLayoutEffect(() => {
    if (written.current.size) write();
  });

  useEffect(
    () => () => {
      if (tick.current) ticks.delete(tick.current);
    },
    [],
  );

  const seed = useCallback((id: string, at: Vec) => follower.seed(id, at), [follower]);
  return { seed };
}
