import type { Metadata, Viewport } from 'next';
import { ErrorReporter } from '@/components/ErrorReporter';
import { siteIdentity } from '@/lib/admin/identity';
import './globals.css';

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
    ...(site.iconUrl ? { icons: { icon: site.iconUrl, shortcut: site.iconUrl, apple: site.iconUrl } } : {}),
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
    <html lang="nl">
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
