import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { storeImage, tooLargeMessage, uploadLimitFor } from '@/lib/assets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Er is geen bestand meegestuurd.' }, { status: 400 });
    const limit = uploadLimitFor(user);
    if (file.size > limit) return json({ error: tooLargeMessage(limit) }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await storeImage(buffer, file.name, file.type, user.id, { limitBytes: limit });
    return json({ asset });
  } catch (err) {
    return apiError(err);
  }
}
