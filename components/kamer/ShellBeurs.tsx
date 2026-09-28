'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { isRefreshHeld, onRefreshHoldChange } from '@/components/live/refreshHold';
import type { Purse } from '@/components/shell/JouwPlek';
import { useUi } from '@/components/ui/UiProvider';
import { roomKey } from '@/lib/live/keys';
import { play, primeKlank } from '@/lib/sound/klank';
import { fill } from '@/lib/words';
import { munt } from './plekWords';
import { setShellRoom } from './saldo';

/** §103 (K4): het id van de laatste gift waarvan deze tab al een melding liet zien. */
export const GRANT_SEEN_KEY = 'low:gift-gezien';

function seenGrant(): string | null {
  try {
    return window.sessionStorage.getItem(GRANT_SEEN_KEY);
  } catch {
    return null;
  }
}

function rememberGrant(id: string) {
  try {
    window.sessionStorage.setItem(GRANT_SEEN_KEY, id);
  } catch {
    /* zonder opslag onthoudt de ref het, tot herladen */
  }
}

/**
 * §103 (K4): moet deze gift gemeld worden? Puur, zodat de regel te testen is:
 * er is een gift, hij is nieuwer dan wat deze tab bij het openen zag
 * (`baseline`), en hij is nog niet gemeld (`seen`, uit `sessionStorage`).
 */
export function grantToAnnounce(
  grant: { id: string } | null | undefined,
  baseline: string | null,
  seen: string | null,
): boolean {
  return Boolean(grant && grant.id !== baseline && grant.id !== seen);
}

/**
 * §84: de beurs in de hoek van élke pagina, en hij beweegt terwijl je kijkt.
 *
 * De schil is een client-component en de layout een server-component, dus het
 * getal komt van boven (`purseOf` in `app/(app)/layout.tsx`) en wordt hier
 * alleen getekend. Wat hier wél moet gebeuren is het tweede deel: een gift van
 * de Keeper hoort meteen te landen, ook als je op een pagina staat die niets
 * met je kamer te maken heeft. `LivePage` doet dat per pagina en kent jouw
 * kamer niet, dus dit kijkt zelf (§21).
 *
 * **Eén sleutel, en het is je eigen.** Nooit die van een ander: dan zou de hoek
 * van elke pagina vertellen wanneer er in andermans kamer iets gebeurt (§76).
 *
 * §59 geldt hier net zo goed als op een pagina: een `router.refresh()` terwijl
 * er een hand op een prikbord ligt, gooit weg wat er half getekend staat. Een
 * vastgehouden signaal wordt **onthouden**, niet weggegooid — dezelfde regel,
 * hier in het klein, want dit is niet de plek om `LivePage`'s hele machinerie
 * na te bouwen: een saldo dat één gebaar later landt is niemands probleem, een
 * saldo dat nooit landt wel.
 *
 * §91: **de pil zelf is weg**, op de desk en op de telefoon. Op de desk staat
 * het saldo nu rechts van *Kamer* in de zijbalk (die er altijd is, ook op een
 * canvas), op de telefoon onder het poppetje van de Jij-tab. Wat hier overbleef
 * is het deel dat nooit een tekening was: het getal komt nog steeds van boven
 * (`purseOf`), en deze hook is nog steeds de enige die naar `room:{id}` luistert
 * voor de schil — één keer gemount in `AppShell`, voor beide tekeningen. Twee
 * lezers van één saldo zouden twee keer `router.refresh()` doen op één gift.
 */
export function useShellBeurs(purse: Purse) {
  const roomId = purse?.roomId ?? null;
  const router = useRouter();
  const ui = useUi();
  const owed = useRef(false);

  /*
   * §103 (K4): de Keeper deelt uit, en de speler hoort het. Het mooiste moment
   * aan tafel gebeurde ongezien: `router.refresh()` bracht het nieuwe saldo, en
   * het getal in de zijbalk veranderde stil.
   *
   * De server geeft de nieuwste gift mee (`purseOf` → `lastGrantOf`: een
   * `grant`-regel met een positief bedrag, niet door wie kijkt), dus deze hook
   * raadt niets en telt niets op (§79). Hij vergelijkt één `id`:
   *
   *   - bij de **eerste render** is wat er staat de nullijn — wie een pagina
   *     opent, krijgt geen melding over een gift van gisteren;
   *   - verandert het `id` daarna, dan één melding, met de reden en een deur;
   *   - het gemelde `id` gaat in `sessionStorage`, zodat herladen, of een schil
   *     die opnieuw mount, dezelfde gift niet nog een keer meldt.
   *
   * Ook op de kamerpagina zelf: daar ververst `LivePage` de pagina, en deze
   * hook ziet dezelfde nieuwe `purse` in de layout.
   */
  const grant = purse?.lastGrant ?? null;
  const baseline = useRef<string | null | undefined>(undefined);
  if (baseline.current === undefined) baseline.current = grant?.id ?? null;
  const words = ui.words;
  const slug = purse?.slug ?? null;
  useEffect(() => {
    if (!grant || !grantToAnnounce(grant, baseline.current ?? null, seenGrant())) return;
    baseline.current = grant.id;
    rememberGrant(grant.id);
    const bedrag = munt(grant.delta, words);
    const message = grant.reason.trim()
      ? fill(words.grantArrived, { bedrag, keeper: words.keeper, reden: grant.reason.trim() })
      : fill(words.grantArrivedPlain, { bedrag, keeper: words.keeper });
    /*
     * §103 golf H (D10/T15): een eigen melding (`toast-munt`: de stempel met
     * het bedrag, de reden cursief, tien seconden en stil onder de muis), en
     * één sleutel voor alle giften: twee kort na elkaar tellen op in dezelfde
     * melding (*+25*) in plaats van twee balken te stapelen.
     */
    ui.toast(
      message,
      slug ? { label: fill(words.toRoom, { kamer: words.room }), onAction: () => router.push(`/kamer/${slug}`) } : undefined,
      { key: 'munt:keeper', munt: { delta: grant.delta, reason: grant.reason.trim() } },
    );
    // K8: een munt, als het geluid aanstaat en de browser al wakker is.
    play('munt', { fromGesture: false });
  }, [grant, words, slug, ui, router]);

  // K8: de gedeelde AudioContext start pas bij een gebaar — één luisteraar per tab.
  useEffect(() => primeKlank(), []);

  // §103 golf H (T8): welke kamer de getallen in de schil tonen (`saldo.ts`).
  useEffect(() => setShellRoom(roomId), [roomId]);

  useLiveChanges(roomId ? [roomKey(roomId)] : [], () => {
    if (isRefreshHeld()) {
      owed.current = true;
      return;
    }
    owed.current = false;
    router.refresh();
  });

  useEffect(() => {
    return onRefreshHoldChange(() => {
      if (isRefreshHeld() || !owed.current) return;
      owed.current = false;
      router.refresh();
    });
  }, [router]);
}
