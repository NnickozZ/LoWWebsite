import { requireKeeper } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The upload probe behind Beheer → Site → "Uploadlimiet testen".
 *
 * The archive lets a player send 10 MB and a Keeper 100 MB, but whatever
 * sits in front of the server has a ceiling of its own — nginx says 413 to
 * anything over 1 MB unless `client_max_body_size` is raised — and from a
 * browser the two look the same. This route swallows a body of any size
 * without keeping it, and answers with how many bytes arrived; the Site pane
 * posts bodies of growing size until one is refused, and then says which
 * server did the refusing and what to change. Keeper only: it is a
 * diagnostic, not a service.
 */
export async function POST(request: Request) {
  try {
    await requireKeeper();
    let bytes = 0;
    if (request.body) {
      const reader = request.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
      }
    }
    return json({ bytes });
  } catch (err) {
    return apiError(err);
  }
}
