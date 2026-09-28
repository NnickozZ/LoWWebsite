'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * §103 (K6): staat de kiezer *Kopen voor* in beeld?
 *
 * §90 zette de naam van de onderzoeker op elke koopknop (*Kopen voor Cornelis
 * Vermeulen · 2 munten → bureau*), omdat een koop voor de verkeerde beurs niet
 * teruggaat en de naam anders alleen in een eyebrow stond. Sinds §90 staat
 * diezelfde naam ook in de kiezer bovenaan, op een chip met het saldo erin — en
 * dan zegt elke knop eronder hem een tweede keer, twee regels lang.
 *
 * Dus: de naam staat op de knop **alleen als je meer dan één onderzoeker draagt
 * én de kiezer buiten beeld is** — wie ver naar beneden gescrold is, ziet hem
 * niet meer, en dan hoort hij weer op de knop. De informatie die §90 eiste gaat
 * niet weg: hij staat er altijd voor een schermlezer (de volledige zin in de
 * toegankelijke naam), en voor het oog precies wanneer de kiezer hem niet meer
 * zegt.
 *
 * Eén waarnemer voor de hele pagina, niet één per knop: een winkel heeft er
 * dertig.
 */

let inView = true;
const listeners = new Set<() => void>();
let observer: IntersectionObserver | null = null;
let watched: Element | null = null;

function set(next: boolean) {
  if (next === inView) return;
  inView = next;
  for (const listener of listeners) listener();
}

function watch() {
  const target = document.querySelector('[data-testid="winkel-kiezer"]');
  if (target === watched) return;
  observer?.disconnect();
  watched = target;
  if (!target || typeof IntersectionObserver === 'undefined') {
    set(true);
    return;
  }
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) set(entry.isIntersecting);
  });
  observer.observe(target);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      observer?.disconnect();
      observer = null;
      watched = null;
      inView = true;
    }
  };
}

/** Of de kiezer te zien is. Zonder kiezer (één onderzoeker) altijd "ja": dan is er geen naam te zeggen. */
export function useKiezerInBeeld(active: boolean): boolean {
  const value = useSyncExternalStore(
    subscribe,
    () => inView,
    () => true,
  );
  useEffect(() => {
    if (active) watch();
  }, [active]);
  return active ? value : true;
}
