/**
 * Golf O (Nick, 1 oktober: *"Ik wil de 'recently aangepast' wel ergens
 * hebben … een nieuw tabje … genaamd 'wiki geschiedenis'"*): wat er in het
 * archief gebeurde, per dag.
 *
 * Puur, zodat de dagen te testen zijn zonder klok of database. De dag is die
 * van het archief (Nederland), niet die van de server: een VPS draait op UTC,
 * en dan viel alles na tien uur 's avonds in de zomer op "morgen".
 */

export const ARCHIEF_TIJDZONE = 'Europe/Amsterdam';

const dagSleutel = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARCHIEF_TIJDZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dagNaam = new Intl.DateTimeFormat('nl-NL', {
  timeZone: ARCHIEF_TIJDZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const dagNaamMetJaar = new Intl.DateTimeFormat('nl-NL', {
  timeZone: ARCHIEF_TIJDZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const klok = new Intl.DateTimeFormat('nl-NL', {
  timeZone: ARCHIEF_TIJDZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/** `2026-10-01` — de dag van een moment (unix-seconden) in het archief. */
export function dayKey(unixSeconds: number): string {
  return dagSleutel.format(new Date(unixSeconds * 1000));
}

/** *Vandaag*, *Gisteren*, of *maandag 28 september* (met het jaar als dat een ander is). */
export function dayLabel(unixSeconds: number, nowMs = Date.now()): string {
  const key = dayKey(unixSeconds);
  const today = dayKey(Math.floor(nowMs / 1000));
  if (key === today) return 'Vandaag';
  if (key === dayKey(Math.floor(nowMs / 1000) - 86_400)) return 'Gisteren';
  const when = new Date(unixSeconds * 1000);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const label = (sameYear ? dagNaam : dagNaamMetJaar).format(when);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** `14:05` — het uur van een moment, in het archief. */
export function timeOf(unixSeconds: number): string {
  return klok.format(new Date(unixSeconds * 1000));
}

/** De rijen (nieuwste eerst) in dagen, in dezelfde volgorde. */
export function groupByDay<T extends { createdAt: number }>(
  items: T[],
  nowMs = Date.now(),
): { key: string; label: string; items: T[] }[] {
  const days: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(item);
    else days.push({ key, label: dayLabel(item.createdAt, nowMs), items: [item] });
  }
  return days;
}
