import type { Metadata, Viewport } from 'next';
import { ErrorReporter } from '@/components/ErrorReporter';
import { FLIP_SCRIPT } from '@/components/keeper/flipRoad';
import { siteIdentity } from '@/lib/admin/identity';
import { MERK_APPLE, MERK_ICON } from '@/lib/merk';
// Golf K: de drie letters voorgeladen, met een systeemletter op maat (app/fonts.ts).
import { fontVariables } from './fonts';
import './globals.css';
// Eén bestand per laag van het gevoel (§102–§104), na globals.css zodat ze winnen.
import './navigatie.css';
import './kaartje.css';
import './moment.css';
import './leeskamer.css';
// Golf i: vlakken.css (i1), eerste-keer.css (i2), beheer.css (i3), in die volgorde.
import './vlakken.css';
import './eerste-keer.css';
import './beheer.css';
// Golf L: de tekens — het kurk, de punaise, het merk en het pijltje.
import './tekens.css';

/**
 * §88: de naam in de tab is de naam van het archief.
 *
 * Hij stond hier als een letterlijke string — `title: 'Zeeland Case Files'` —
 * terwijl de naam sinds het begin een instelling is (Beheer → Site) die de kop
 * van de zijbalk wél leest. Je kon het archief dus hernoemen en de tab bleef de
 * oude naam dragen, zonder dat iets zei waarom. Nick, ronde 49, liep er tegen
 * de enige kant van op: hij wilde een andere naam in de tab.
 *
 * Dit is de **wortel** van de app, boven de inlogpoort, dus hij draait voor
 * élke pagina — ook de loginpagina, die geen sessie heeft. `siteIdentity`
 * leest daarom niets dat achter een recht zit: de naam en het icoontje van een
 * archief zijn geen geheim, en wie op de deur staat mag weten waar hij aanklopt.
 *
 * Het icoontje is een asset, en assets zitten wél achter de inlog
 * (`/api/assets/[id]` geeft 401 zonder sessie). Dat is met opzet zo en het
 * blijft zo: een uitgelogde browser krijgt het standaardicoon en een
 * ingelogde het jouwe. De tab is geen plek om een regel voor op te rekken.
 */
export async function generateMetadata(): Promise<Metadata> {
  const site = siteIdentity();
  return {
    title: site.name,
    description: site.tagline || 'Archief van de campagne',
    robots: { index: false, follow: false },
    // Golf L: zonder eigen icoontje het merk van het archief (`public/merk.svg`),
    // in plaats van het lege tabje van de browser — en een `/favicon.ico` die de
    // schil rendert (golf H). Het merk staat buiten de inlog, het eigen icoontje
    // niet (§88).
    icons: site.iconUrl
      ? { icon: site.iconUrl, shortcut: site.iconUrl, apple: site.iconUrl }
      : { icon: [{ url: MERK_ICON, type: 'image/svg+xml' }], apple: MERK_APPLE },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EEE2' },
    { media: '(prefers-color-scheme: dark)', color: '#1B1915' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={fontVariables}>
      {/*
        §102: de omslag-cirkel. The one inline script: it has to be listening
        for `pagereveal` before the first frame, which no effect is. What it
        does, and why it skips every navigation but a flip, is in `flipRoad.ts`.
      */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: FLIP_SCRIPT }} />
      </head>
      <body>
        {/*
          Mounted at the root, above the login boundary, because a browser
          exception on the sign-in page is as worth having as one inside the
          archive. It renders nothing.
        */}
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
