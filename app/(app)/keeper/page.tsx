import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * §46: de Keeperkant is not a list any more — it is the whole archive, seen
 * from the other side.
 *
 * Round 22 made this page one long index of everything keeper-only. Round 23
 * took the idea further than a page could: one toggle turns the *site* over,
 * and every list — Start, Wiki, Dossiers, Prikborden, Landkaarten, Tijdlijnen,
 * het Web, Zoeken — then shows only the Keeper's own things. So the address
 * keeps its meaning ("take me to the Keeper's side") and stops being a screen:
 * it sets the side and puts the reader down on the Start of it.
 *
 * The road is `/api/keeper/flip`, which is the only place the cookie is
 * written, so this grants nothing that the toggle does not. For anybody who is
 * not a Keeper — a player, or a Keeper looking as a player — that route quietly
 * sets nothing and they land on the ordinary Start page, which is exactly what
 * they would have seen anyway. Nothing here says the Keeper's side exists.
 */
export default async function KeeperSidePage() {
  redirect('/api/keeper/flip?side=keeper&to=/');
}
