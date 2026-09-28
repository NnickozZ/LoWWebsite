'use server';

import { getSessionUser } from '@/lib/auth/session';
import { archiveCard, randomEntry, type ArchiveCard } from '@/lib/wiki/leeskamer';

/**
 * §104, ronde 67 (L1/L2): *Nog één* — een ander artikel uit het archief, zonder
 * de pagina te verlaten.
 *
 * Dezelfde regel als `/wiki/willekeurig` en *Verras me* in het palet: alleen
 * `randomEntry`, dus alleen wat deze lezer mag zien, aan de kant waar hij staat
 * (§46). De kaart die terugkomt is per lezer gemaakt (`archiveCard`): een chip
 * in de korte beschrijving is de naam die hij mag zien, of niets.
 *
 * Een uitgelogde browser krijgt niets (§89). Dit schrijft niets; het is een
 * server action omdat een knop op een pagina die al per lezer gebouwd is, zo
 * het kortst dezelfde sessie meeneemt.
 */
export async function anotherFromTheArchive(notId: string | null): Promise<ArchiveCard | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return archiveCard(user, randomEntry(user, typeof notId === 'string' ? notId : null));
}
