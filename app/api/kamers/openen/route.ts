import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { KamerError, openRoomFor } from '@/lib/kamers/service';

export const dynamic = 'force-dynamic';

/**
 * §86: een kamer openen voor een onderzoeker die niemand draagt.
 *
 * Eén handeling, en met opzet een POST en geen bijwerking van een lezing.
 * `getOrCreateRoom` maakt een kamer wél op een *read*, en dat is daar goed —
 * een kamer van een gedragen karakter heeft geen inhoud tot iemand iets
 * uitgeeft, dus hem aanmaken op het moment dat er naar gekeken wordt scheelt
 * een migratie en een tweede weg. Hier kan dat niet: er is geen vraag waaruit
 * volgt dat dít artikel er een hoort te hebben. De Keeper zegt het, dus hij
 * drukt erop.
 *
 * Keeper-only, en die vraag staat in `openRoomFor` en niet hier — dit is de
 * tweede gleuf van §80, niet het slot zelf: een speler die deze route met de
 * hand aanroept krijgt `null` terug en er gebeurt niets.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as { entryId?: unknown };
    const roomId = openRoomFor(String(body.entryId ?? ''), user);
    if (!roomId) return json({ error: 'Dat kan hier niet.' }, { status: 400 });
    return json({ roomId });
  } catch (err) {
    if (err instanceof KamerError) return json({ error: err.message }, { status: 400 });
    return apiError(err);
  }
}
