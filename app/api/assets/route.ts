import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { MAX_UPLOAD_BYTES, storeImage } from '@/lib/assets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'Er is geen bestand meegestuurd.' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return json({ error: 'Die afbeelding is groter dan de limiet van 20 MB.' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const asset = await storeImage(buffer, file.name, file.type, user.id);
    return json({ asset });
  } catch (err) {
    return apiError(err);
  }
}
