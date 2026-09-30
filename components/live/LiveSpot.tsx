'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { onCameraWrite, writeChoice } from '@/lib/canvas/memory';
import { cameraSpot, parseSpot, sectionSpot, SPOT_PARAM, SPOT_SETTLE_MS, spotOfHref } from '@/lib/live/spot';
import { useLiveBase } from './LiveProvider';

/**
 * Golf M (A3/A4): *de plek op de plek*, de helft in de browser.
 *
 * Twee dingen, allebei stil:
 *
 *   - **zeggen waar je staat.** Elke camera van een tekenvlak gaat al door
 *     `writeCamera` (§94); die roept hier, en pas als de hand
 *     `SPOT_SETTLE_MS` stil ligt gaat de laatste camera de lijn op. Op een
 *     pagina met secties (een artikel, een dossier, een overzicht) is het de
 *     sectie die bovenaan het venster staat, ook pas als het scrollen stopt.
 *     Geen canvas hoeft er iets voor te doen.
 *   - **aankomen waar een ander stond.** Een camera leest het vlak zelf uit het
 *     adres (`readCamera` in `lib/canvas/memory.ts`); een sectie zoekt deze
 *     component op, scrolt ernaartoe en haalt `?waar=` uit het adres.
 *
 * De server beslist per kijker of een plek aan een deur mag hangen
 * (`spotForViewer` in `lib/live/roster.ts`): hier wordt alleen gezegd, nooit
 * gekeurd.
 */
export function LiveSpot() {
  return (
    <>
      <SpotReport />
      <Suspense fallback={null}>
        <SpotArrival />
      </Suspense>
    </>
  );
}

/** Een sectie op de pagina: `section-{id}`, niet de titelbox `section-title-{id}`. */
function sectionsOnPage(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('main.main .entry-section[id^="section-"]')].filter(
    (el) => !el.id.startsWith('section-title-') && /^section-[A-Za-z0-9_-]{1,64}$/.test(el.id),
  );
}

function SpotReport() {
  const { setSpot } = useLiveBase();

  // De camera van een tekenvlak, als de hand stil ligt.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onCameraWrite((kind, id, value) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const spot = cameraSpot(kind, id, value);
        if (spot) setSpot(spot);
      }, SPOT_SETTLE_MS);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [setSpot]);

  // De sectie bovenaan het venster, als het scrollen stopt.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const measure = () => {
      timer = null;
      const sections = sectionsOnPage();
      if (!sections.length) return;
      // Een sectie telt vanaf het moment dat haar kop in het bovenste derde staat.
      const line = window.innerHeight / 3;
      let current: HTMLElement | null = null;
      for (const el of sections) {
        if (el.getBoundingClientRect().top <= line) current = el;
        else break;
      }
      setSpot(current ? sectionSpot(current.id.slice('section-'.length)) : null);
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, SPOT_SETTLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [setSpot]);

  return null;
}

/** Hoe ver onder de bovenrand een sectie landt: een hand breed lucht. */
const LAND_GAP = 16;

function SpotArrival() {
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search.get(SPOT_PARAM);
  /**
   * Golf M (herstel): the two look-agains after a landing. Not cleared when
   * `raw` changes — landing itself empties it (`writeChoice`) — but when the
   * page changes, the component goes, or another spot lands.
   */
  const later = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearLater = useCallback(() => {
    for (const one of later.current) clearTimeout(one);
    later.current = [];
  }, []);
  useEffect(() => clearLater, [pathname, clearLater]);

  useEffect(() => {
    const spot = parseSpot(raw);
    // Een camera leest het vlak zelf (`readCamera`); alleen een sectie is van hier.
    if (!spot || spot.kind !== 'section') return;
    clearLater();
    const id = `section-${spot.id}`;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const land = (el: HTMLElement, smooth: boolean) => {
      const top = el.getBoundingClientRect().top + window.scrollY - LAND_GAP;
      window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduce ? 'smooth' : 'auto' });
    };
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        land(el, false);
        writeChoice(SPOT_PARAM, null);
        // Wat na de eerste verf nog binnenkomt (een editor, een omslag), kan de
        // sectie een stuk opschuiven. Twee keer nakijken, dan is hij er.
        for (const wait of [300, 900]) {
          later.current.push(setTimeout(() => {
            const still = document.getElementById(id);
            if (still && Math.abs(still.getBoundingClientRect().top - LAND_GAP) > 8) land(still, false);
          }, wait));
        }
        return;
      }
      tries += 1;
      if (tries > 40) {
        // Niet gevonden (weg, of niet voor jou): de pagina staat er gewoon.
        writeChoice(SPOT_PARAM, null);
        return;
      }
      timer = setTimeout(tick, 100);
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pathname, raw, clearLater]);

  return null;
}

/**
 * Golf M (A3): een deur naar een plek op dezelfde pagina als waar je staat.
 *
 * Next navigeert dan niet opnieuw: het vlak blijft gemount en leest zijn
 * camera niet nog eens. Voor een camera op hetzelfde vlak laadt de deur het
 * document dus opnieuw, met de plek erin; een sectie scrolt vanzelf
 * (`SpotArrival` hoort het adres veranderen). Geeft `true` als hij het
 * overnam.
 */
export function goToSpotHere(href: string): boolean {
  if (typeof window === 'undefined') return false;
  const spot = parseSpot(spotOfHref(href));
  if (!spot || spot.kind !== 'camera') return false;
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (url.pathname !== window.location.pathname) return false;
  window.location.assign(url.pathname + url.search + url.hash);
  return true;
}
