import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

/**
 * §88: hoe het archief zichzelf noemt, en waarmee het zich laat herkennen.
 *
 * Eén lezing voor de twee dingen die in de browsertab terechtkomen. Hij staat
 * apart van `lib/admin/words.ts` en `schemes.ts` om dezelfde reden als die twee
 * apart staan: dit is de helft die de *wortel* van de app nodig heeft, boven de
 * inlogpoort, en daar mag niets binnenkomen dat een recht veronderstelt.
 *
 * **Wat hier bewust niet gebeurt**: er wordt geen sessie gelezen en geen
 * zichtbaarheid gevraagd. De naam van een archief en het plaatje in zijn tab
 * zijn geen geheim — wie op de deur staat mag weten waar hij aanklopt — en een
 * `getSessionUser()` in de wortel zou elke pagina in het archief door de
 * sessielaag trekken voor een titel.
 *
 * Het icoontje valt terug op het logo. Wie er één heeft geüpload wil hem
 * vrijwel zeker ook in de tab, en twee keer hetzelfde plaatje moeten uploaden
 * is precies het soort kleine wrijving waar een Keeper niet aan toe komt.
 *
 * Dat de *asset* achter de inlog zit (`/api/assets/[id]` geeft 401 zonder
 * sessie) blijft zo: een uitgelogde browser krijgt het standaardicoon, een
 * ingelogde het jouwe.
 */
export type SiteIdentity = {
  name: string;
  tagline: string;
  /** Het adres van het icoontje, of null als er geen is (ook geen logo). */
  iconUrl: string | null;
};

export const DEFAULT_SITE_NAME = 'LoW: Land over Water Archief';

export function siteIdentity(): SiteIdentity {
  const row = db
    .select({
      name: schema.siteSettings.name,
      tagline: schema.siteSettings.tagline,
      logoAssetId: schema.siteSettings.logoAssetId,
      faviconAssetId: schema.siteSettings.faviconAssetId,
    })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.id, 1))
    .get();

  const icon = row?.faviconAssetId ?? row?.logoAssetId ?? null;
  return {
    name: row?.name?.trim() || DEFAULT_SITE_NAME,
    tagline: row?.tagline?.trim() ?? '',
    // `thumb` (400 px) en niet `full`: een tab toont hem op zestien pixels, en
    // de browser haalt hem op elke pagina opnieuw op.
    iconUrl: icon ? `/api/assets/${icon}?s=thumb` : null,
  };
}
