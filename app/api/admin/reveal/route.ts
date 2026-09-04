import { eq } from 'drizzle-orm';
import { requireKeeper } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { decryptPassword } from '@/lib/auth/password.mjs';
import { logAudit } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

/**
 * §4: a Keeper may read a player's password. Every read writes an audit row
 * visible to all Keepers; that is the price of the requirement.
 */
export async function POST(request: Request) {
  try {
    const keeper = await requireKeeper();
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) return json({ error: 'Geen gebruiker opgegeven.' }, { status: 400 });

    const row = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    if (!row) return json({ error: 'Die gebruiker bestaat niet.' }, { status: 404 });

    logAudit({
      actorId: keeper.id,
      action: 'password.revealed',
      targetType: 'user',
      targetId: userId,
      meta: { username: row.username },
    });

    const password = decryptPassword(row.passwordEnc);
    if (password === null) {
      return json({
        error:
          'De opgeslagen kopie kan niet worden gelezen — PASSWORD_RECOVERY_KEY is gewijzigd sinds dit wachtwoord is ingesteld. Gebruik in plaats daarvan ‘Nieuw wachtwoord instellen’.',
      });
    }
    return json({ password });
  } catch (err) {
    return apiError(err);
  }
}
