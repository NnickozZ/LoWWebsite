'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveChanges } from '@/components/live/LiveProvider';
import { isRefreshHeld, onRefreshHoldChange } from '@/components/live/refreshHold';
import { roomKey } from '@/lib/live/keys';
import type { Words } from '@/lib/words';
import { Beurs } from './Beurs';

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
 */
export function ShellBeurs({ roomId, balance, slug, words }: { roomId: string; balance: number; slug: string; words: Words }) {
  const router = useRouter();
  const owed = useRef(false);

  useLiveChanges([roomKey(roomId)], () => {
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

  return (
    <div className="shell-beurs" data-testid="shell-beurs">
      <Beurs balance={balance} words={words} href={`/kamer/${slug}`} size="small" />
    </div>
  );
}
