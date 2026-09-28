import { notFound } from 'next/navigation';
import { requireViewer } from '@/lib/auth/session';

/**
 * §102, golf h1 (D2, T13): een onbekend adres is een 404 *in de schil*.
 *
 * `/bestaat-niet` viel onder geen enkele route in `app/(app)`, en Next tekende
 * dan zijn eigen Engelse pagina — wit, zonder zijbalk, zonder tabbalk en
 * zonder weg terug. Binnen de groep bestond de mooie pagina al
 * (`app/(app)/not-found.tsx`); dit vangt alles wat nergens anders heen kan en
 * stuurt het daarheen, met de status 404.
 *
 * Een gevonden route wint altijd van een catch-all, dus niets verandert voor
 * een adres dat bestaat. `requireViewer()` eerst (§89, `sloten.test`): wie
 * niet ingelogd is, gaat naar de deur en leert niets over wat er bestaat.
 * Er is niets om live te houden, dus geen `LivePage` (`live-everywhere.test`
 * kent deze vorm: een pagina die alleen `notFound()` is).
 */
export default async function NergensPage() {
  await requireViewer();
  notFound();
}
