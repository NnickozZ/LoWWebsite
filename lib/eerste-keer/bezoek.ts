import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { FIRST_VISIT_COOKIE, isNewAccount, seenPlaces, type FirstVisitPlace } from './stappen';

export type FirstVisitOffer = {
  /** Een nieuw account (`isNewAccount`): alleen dan komt de regel ooit. */
  eligible: boolean;
  /** Wat de server uit het koekje las: nog nooit gezien in deze browser. */
  firstUnseen: boolean;
};

/**
 * §106: mag deze kijker de regel van een eerste bezoek krijgen, en heeft deze
 * browser deze plek al gezien? Het eerste is het account (M9, na review 4),
 * het tweede de spiegel van `localStorage` (`FIRST_VISIT_COOKIE`); de cliënt
 * beslist daarna.
 */
export async function firstVisitOffer(
  place: FirstVisitPlace,
  viewer: { id: string } | null | undefined,
): Promise<FirstVisitOffer> {
  if (!viewer) return { eligible: false, firstUnseen: false };
  const row = db
    .select({ createdAt: schema.users.createdAt })
    .from(schema.users)
    .where(eq(schema.users.id, viewer.id))
    .get();
  const eligible = isNewAccount(row?.createdAt);
  if (!eligible) return { eligible, firstUnseen: false };
  const jar = await cookies();
  return { eligible, firstUnseen: !seenPlaces(jar.get(FIRST_VISIT_COOKIE)?.value).has(place) };
}
