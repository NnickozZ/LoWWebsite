import { and, eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { db, schema } from '@/lib/db';
import { visibleEntryCondition } from '@/lib/entries/visibility';

export const dynamic = 'force-dynamic';

/** The hover / long-press card on an entry chip (§6). */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) return json({ entry: null });

    const entry = db
      .select({
        id: schema.entries.id,
        slug: schema.entries.slug,
        name: schema.entries.name,
        shortDescription: schema.entries.shortDescription,
        coverAssetId: schema.entries.coverAssetId,
        coverCrop: schema.entries.coverCrop,
        typeLabel: schema.entryTypes.label,
        typeIcon: schema.entryTypes.icon,
        typeColour: schema.entryTypes.colour,
        typeBorder: schema.entryTypes.border,
      })
      .from(schema.entries)
      .innerJoin(schema.entryTypes, eq(schema.entryTypes.id, schema.entries.typeId))
      .where(and(eq(schema.entries.id, id), visibleEntryCondition(user)))
      .get();

    return json({ entry: entry ?? null });
  } catch (err) {
    return apiError(err);
  }
}
