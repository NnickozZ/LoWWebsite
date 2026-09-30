/**
 * Golf M (samen): wat een ander sleept, glijdt — het springt niet.
 *
 * Een hand komt binnen als frames, hooguit één per `POINTER_CARRY_THROTTLE_MS`
 * (§60), en daartussen weet niemand waar het kaartje is. Tot golf M gleed het
 * met een CSS-overgang van 70 ms van frame naar frame — korter dan de afstand
 * tussen twee frames, dus: schuiven, stilstaan, schuiven. Precies het schokken
 * dat Nick zag.
 *
 * Hier volgt elk gedragen ding zijn laatste doel als een **kritisch gedempte
 * veer**: het trekt naar het doel toe, remt af zonder door te schieten, en een
 * nieuw doel halverwege buigt de beweging om in plaats van haar opnieuw te
 * beginnen. De snelheid loopt dus door tussen frames — daar zit het verschil
 * met afzonderlijke stapjes.
 *
 * Wat hier niet gebeurt: het tekenen. Dit is de som, en die rekent in de
 * eenheden van het vlak (bordeenheden, fracties van de plaat, seconden op een
 * as); `useFollow` zet de uitkomst als `translate` op de elementen.
 */

export type Vec = { x: number; y: number };

/**
 * Hoe strak de veer trekt, in 1/s, zolang er nog geen maat is. De
 * achterstand bij een gelijkmatige sleep is 2/ω — hier zo'n 60 ms, ongeveer
 * één frame-afstand — en een trap van 50 ms tussen twee frames wordt ruim
 * twintig keer kleiner uitgesmeerd.
 */
export const FOLLOW_OMEGA = 32;
/**
 * Maar de veer **meet** hoe ver de frames uit elkaar liggen, per ding, en
 * trekt zo strak als die afstand toelaat: ω = 2 / afstand, zodat de
 * achterstand steeds ongeveer één frame is. Twintig frames per seconde geeft
 * ω = 40; een trage lijn (een frame per vijfde seconde) ω = 10 — een kaartje
 * dat dan een tel achterloopt maar blijft glijden, in plaats van een dat
 * aankomt, stilstaat en weer vertrekt. Binnen deze grenzen.
 */
export const FOLLOW_OMEGA_MIN = 8;
export const FOLLOW_OMEGA_MAX = 40;
/** Een sprong groter dan dit (in schermpixels) is geen beweging maar een verhuizing: meteen. */
export const FOLLOW_SNAP_PX = 900;
/** Dichter dan dit bij het doel (schermpixels) en zo goed als stil: het staat. */
const REST_PX = 0.25;
const REST_SPEED_PX = 6;
/** Een tab die even niet tekende, springt niet in één stap door de hele som. */
const MAX_STEP_MS = 64;

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  /** Wanneer het doel voor het laatst veranderde (ms), en hoe ver frames gemiddeld uit elkaar liggen. */
  movedAt: number | null;
  gap: number | null;
};

/** ω bij een gemeten afstand tussen frames (ms), binnen de grenzen. */
export function omegaFor(gapMs: number | null): number {
  if (gapMs === null || !Number.isFinite(gapMs) || gapMs <= 0) return FOLLOW_OMEGA;
  return Math.min(FOLLOW_OMEGA_MAX, Math.max(FOLLOW_OMEGA_MIN, 2000 / gapMs));
}

/**
 * Eén as van de veer, exact over `dt` (seconden): stabiel bij elke stapgrootte.
 * `e` is de afstand tot het doel, `v` de snelheid.
 */
export function springAxis(e: number, v: number, dt: number, omega = FOLLOW_OMEGA): [number, number] {
  const decay = Math.exp(-omega * dt);
  const c = v + omega * e;
  return [(e + c * dt) * decay, (v - omega * c * dt) * decay];
}

/**
 * De volger: een lichaam per ding, dat naar zijn doel trekt. Puur — geen
 * DOM, geen klok; wie hem gebruikt, zegt hoeveel tijd er verstreek.
 */
export class Follower {
  private bodies = new Map<string, Body>();
  private seeds = new Map<string, Vec>();

  constructor(private snapPx = FOLLOW_SNAP_PX) {}

  /**
   * Waar het volgende nieuwe lichaam voor `id` vandaan komt, in plaats van
   * meteen op zijn doel. Voor een sleep die hier werd afgebroken omdat een
   * ander het net eerder pakte: het kaartje glijdt van waar deze hand het had
   * naar waar de hand van de ander het heeft.
   */
  seed(id: string, at: Vec): void {
    this.seeds.set(id, { x: at.x, y: at.y });
  }

  /**
   * De nieuwe doelen. Een nieuw id staat meteen op zijn doel (of op zijn
   * zaadje); een id dat verdween, is weg — wat het tekent staat dan weer waar
   * React het zet. Een sprong verder dan `snapPx` gaat in één keer.
   * Geeft de ids terug die verdwenen.
   */
  retarget(targets: ReadonlyMap<string, Vec>, scale: Vec, now?: number): string[] {
    const removed: string[] = [];
    for (const id of this.bodies.keys()) if (!targets.has(id)) removed.push(id);
    for (const id of removed) this.bodies.delete(id);
    for (const [id, t] of targets) {
      const body = this.bodies.get(id);
      if (!body) {
        const seed = this.seeds.get(id);
        this.seeds.delete(id);
        const from = seed && Math.hypot((seed.x - t.x) * scale.x, (seed.y - t.y) * scale.y) <= this.snapPx ? seed : t;
        this.bodies.set(id, { x: from.x, y: from.y, vx: 0, vy: 0, tx: t.x, ty: t.y, movedAt: now ?? null, gap: null });
        continue;
      }
      if (body.tx !== t.x || body.ty !== t.y) {
        /*
         * Hoe ver frames uit elkaar liggen, zacht gemiddeld. Een pauze langer
         * dan een halve seconde is een hand die stillag, geen trage lijn, en
         * telt niet mee.
         */
        if (now !== undefined) {
          const gap = body.movedAt === null ? null : now - body.movedAt;
          if (gap !== null && gap > 0 && gap < 500) body.gap = body.gap === null ? gap : body.gap * 0.7 + gap * 0.3;
          body.movedAt = now;
        }
      }
      body.tx = t.x;
      body.ty = t.y;
      if (Math.hypot((body.x - t.x) * scale.x, (body.y - t.y) * scale.y) > this.snapPx) this.snap(id);
    }
    return removed;
  }

  /** Meteen op het doel, zonder snelheid. */
  snap(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;
    body.x = body.tx;
    body.y = body.ty;
    body.vx = 0;
    body.vy = 0;
  }

  snapAll(): void {
    for (const id of this.bodies.keys()) this.snap(id);
  }

  /**
   * Een stap van `dtMs`. Geeft terug of er nog iets beweegt; wat (in
   * schermpixels) stil genoeg staat, wordt op zijn doel gezet.
   */
  step(dtMs: number, scale: Vec): boolean {
    const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000;
    let moving = false;
    for (const body of this.bodies.values()) {
      if (body.x === body.tx && body.y === body.ty && !body.vx && !body.vy) continue;
      const omega = omegaFor(body.gap);
      const [ex, vx] = springAxis(body.x - body.tx, body.vx, dt, omega);
      const [ey, vy] = springAxis(body.y - body.ty, body.vy, dt, omega);
      body.x = body.tx + ex;
      body.y = body.ty + ey;
      body.vx = vx;
      body.vy = vy;
      const rest =
        Math.hypot(ex * scale.x, ey * scale.y) < REST_PX && Math.hypot(vx * scale.x, vy * scale.y) < REST_SPEED_PX;
      if (rest) {
        body.x = body.tx;
        body.y = body.ty;
        body.vx = 0;
        body.vy = 0;
      } else {
        moving = true;
      }
    }
    return moving;
  }

  /** Of er iets niet op zijn doel staat. */
  moving(): boolean {
    for (const body of this.bodies.values()) {
      if (body.x !== body.tx || body.y !== body.ty || body.vx || body.vy) return true;
    }
    return false;
  }

  ids(): string[] {
    return [...this.bodies.keys()];
  }

  /** Waar het getekend staat min waar React het zet, in schermpixels. */
  offset(id: string, scale: Vec): Vec {
    const body = this.bodies.get(id);
    if (!body) return { x: 0, y: 0 };
    return { x: (body.x - body.tx) * scale.x, y: (body.y - body.ty) * scale.y };
  }

  /** Waar elk ding nu getekend staat, in de eenheden van het vlak. */
  visuals(): Map<string, Vec> {
    const out = new Map<string, Vec>();
    for (const [id, body] of this.bodies) out.set(id, { x: body.x, y: body.y });
    return out;
  }
}

/** Een verschuiving als waarde voor de CSS-eigenschap `translate`; leeg als er niets te verschuiven is. */
export function translateValue(offset: Vec): string {
  const x = Math.round(offset.x * 100) / 100;
  const y = Math.round(offset.y * 100) / 100;
  return x || y ? `${x}px ${y}px` : '';
}
