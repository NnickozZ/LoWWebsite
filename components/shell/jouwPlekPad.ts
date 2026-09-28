/**
 * §102, golf h1: de twee pure vragen van jouw plek over het adres, los van React
 * zodat een unit-test ze kan stellen (`tests/unit/golf-h1-schil.test.ts`).
 */

function isHere(pathname: string, href: string) {
  const path = href.split('?')[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * §102, golf h1 (D18): which door of jouw plek is *the* current one. On
 * `/spelers/<jij>` both *Mijn spelerspagina* and *Spelers* matched, and the
 * side menu showed two active lines with two red strokes. The longest address
 * that matches wins; pure, so a unit test can ask it.
 */
export function currentDoor(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!isHere(pathname, href)) continue;
    if (!best || href.split('?')[0].length > best.split('?')[0].length) best = href;
  }
  return best;
}

/**
 * §102, golf h1 (T7): the Jij tab is the phone's door to jouw plek, so it is the
 * current tab wherever jouw plek is — the kamer, the winkel, the hal and every
 * spelerspagina, and /you. Before, only /you lit it, and on the kamer no tab
 * at all was lit.
 */
export function jijIsHere(pathname: string): boolean {
  return (
    pathname === '/you' ||
    pathname.startsWith('/kamer/') ||
    pathname === '/winkel' ||
    pathname === '/spelers' ||
    pathname.startsWith('/spelers/')
  );
}
