'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * §102 (ronde 65·b, J2): de streep bovenaan de inhoudskolom die zegt dat een
 * navigatie loopt.
 *
 * De review mat het: bij 300 ms vertraging stond het scherm 385 ms stil na een
 * klik, bij 900 ms ruim een seconde, zonder enig teken. Dit is de tweede van
 * twee lagen (het vakje, `NavPending`; de streep, dit). Sinds golf M zijn het
 * er twee: het skelet is weg, zie hieronder.
 *
 * **Start.** Op een `click` in de *bubble*-fase op `document`, dus ná de eigen
 * handlers, op een `<a>` met een interne `href`, en alleen als:
 *   - het de linkermuisknop is, zonder Ctrl, ⌘, Shift of Alt;
 *   - de link geen `target` en geen `download` heeft;
 *   - het adres een ander is dan dit (pad of zoekvraag; alleen een `#` telt
 *     niet — dat is scrollen, geen navigatie);
 *   - het geen `/api/`-adres is (een download of de omslag, die een eigen
 *     teken heeft);
 *   - de link niet in een bewerkbaar vak staat. Een chip in Bewerken zet de
 *     caret en blijft staan (§98);
 *   - de link niet op een tekenvlak staat (`.page-canvas`, §34). Daar is een
 *     klik op een kaartje een keuze, geen navigatie; het vlak zegt zelf
 *     `preventDefault` en loopt pas bij een dubbelklik, via `router.push`.
 *
 * `defaultPrevented` zegt hier niets: Next's `Link` voorkomt altijd de
 * standaardactie en navigeert zelf.
 *
 * **Niet meegeteld:** `router.push` uit code — het palet, *Kopen*, *Bekijk* in
 * de kamer, een dubbelklik op een tekenvlak. Die hebben hun eigen blad of
 * melding die al antwoordt, en een streep bovenop zou twee tekens voor één
 * klik zijn.
 *
 * **Alleen de streep** (golf M, A1 — draait §102's skelet en de fade om).
 * De oude pagina blijft staan tot de nieuwe klaar is, en wisselt dan in één
 * keer, zonder skelet ertussen en zonder dat de nieuwe pagina invervaagt. Nick:
 * "When I switch tabs on the left hand it blinks? It looks laggy and wrong." Het
 * skelet (na 150 ms over de kolom) en de fade (van 0,6) waren samen twee
 * wissels voor één klik; nu is er één. Het vakje dat je aanklikt (`NavPending`,
 * `data-pending`) antwoordt nog steeds meteen, en de streep komt na 150 ms.
 *
 * **Stop.** Zodra `usePathname()` of `useSearchParams()` wisselt: dan staat de
 * nieuwe pagina er, in dezelfde commit, en schiet de streep naar het eind.
 *
 * **Tekening.** Pas zichtbaar na 150 ms (`--dur-3`), zodat een snelle
 * navigatie niet flitst. 2 px, `--accent`, vast bovenaan de inhoudskolom en
 * niet over de zijbalk. Groeit met `scaleX` naar 80 %, schiet bij klaar naar
 * 100 % en vervaagt. Reduced motion: een vaste streep, zonder groei.
 *
 * **Vangnet.** Na 10 s stil weg: een navigatie die nergens uitkomt (een fout,
 * een omleiding terug naar hier) laat geen streep achter.
 */

const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 10_000;
/** Hoe lang de streep na klaar nog staat: `--dur-3` om te vervagen, plus een tel. */
const FINISH_MS = 260;

type Phase = 'idle' | 'waiting' | 'shown' | 'done';

/** Waar deze klik heen gaat, als het een navigatie is waar de streep bij hoort. */
function startsNavigation(event: MouseEvent): { url: URL; link: HTMLAnchorElement } | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const link = target.closest('a');
  if (!link || !link.hasAttribute('href')) return null;
  if (link.hasAttribute('download')) return null;
  const frame = link.getAttribute('target');
  if (frame && frame !== '_self') return null;
  if (link.closest('[contenteditable]:not([contenteditable="false"])')) return null;
  if (link.closest('.page-canvas')) return null;
  let url: URL;
  try {
    url = new URL(link.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return null;
  // Hetzelfde adres, of alleen een ander `#`: er wordt niets geladen.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return { url, link };
}

/**
 * §102, golf h1 (D3, T7): welk element het teken van de hand draagt. Het vakje in de
 * zijbalk en de tabbalk had het al (`NavPending`, `useLinkStatus`); nu krijgt
 * elke interne link het, binnen dezelfde klik: een kaart, een feedregel, een
 * naam in de tekst, een rij in een lijst. Een deur in het Jij-blad verdwijnt
 * met het blad, dus daar draagt de Jij-tab het teken — die wordt actief waar
 * de deur heen gaat (`jijIsHere`).
 */
function pendingHolder(link: HTMLAnchorElement): Element {
  if (link.closest('.jij-sheet')) return document.querySelector('.tabs > .tab-jij') ?? link;
  return link;
}

function Bar({ label }: { label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = `${pathname}?${search}`;
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<number[]>([]);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  // §102, golf h1 (D3): wat nu `data-pending` draagt, tot de pagina er is.
  const held = useRef<Element | null>(null);
  const release = () => {
    held.current?.removeAttribute('data-pending');
    held.current = null;
  };

  const clear = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  useEffect(() => {
    /*
     * §102, golf h1 (T7): in de *capture*-fase. Een deur in het Jij-blad sluit het
     * blad in zijn eigen klik, en React haalt het blad dan weg vóór de klik in
     * de bubble-fase bij `document` aankomt — de streep startte daar nooit.
     * Wat `startsNavigation` weigert (een bewerkbaar vak, een tekenvlak, een
     * `#`), weigert het nog steeds.
     */
    const onClick = (event: MouseEvent) => {
      const found = startsNavigation(event);
      if (!found) return;
      clear();
      release();
      held.current = pendingHolder(found.link);
      held.current.setAttribute('data-pending', '');
      // Een tweede klik tijdens een lopende streep laat hem staan.
      if (phaseRef.current !== 'shown') setPhase('waiting');
      timers.current.push(
        window.setTimeout(() => setPhase((now) => (now === 'waiting' ? 'shown' : now)), SHOW_AFTER_MS),
        window.setTimeout(() => {
          setPhase('idle');
          release();
        }, GIVE_UP_MS),
      );
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clear();
      release();
    };
  }, []);

  /*
   * Het adres is gewisseld: de navigatie is aangekomen. Een streep die nog
   * niet te zien was, komt nooit; een die er stond, schiet naar het eind en
   * vervaagt.
   */
  const first = useRef(here);
  useLayoutEffect(() => {
    if (first.current === here) return;
    first.current = here;
    // §102, golf h1 (D3): de pagina is er; de hand laat los, in dezelfde commit.
    release();
    const now = phaseRef.current;
    if (now === 'idle' || now === 'done') return;
    clear();
    if (now === 'waiting') {
      // Nog niets te zien geweest: een snelle navigatie toont niets.
      setPhase('idle');
      return;
    }
    setPhase('done');
    timers.current.push(window.setTimeout(() => setPhase('idle'), FINISH_MS));
  }, [here]);

  const shown = phase === 'shown' || phase === 'done';

  return (
    <div
      className="nav-progress"
      role="progressbar"
      aria-label={label}
      aria-hidden={shown ? undefined : true}
      data-shown={shown ? '1' : '0'}
      data-done={phase === 'done' ? '1' : undefined}
    >
      <span className="nav-progress-bar" />
    </div>
  );
}

export function NavProgress({ label }: { label: string }) {
  // `useSearchParams` achter een Suspense, anders klaagt de build.
  return (
    <Suspense fallback={null}>
      <Bar label={label} />
    </Suspense>
  );
}
