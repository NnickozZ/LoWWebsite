import { requireKeeper } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { createSection } from '@/lib/entries/secrets';

export const dynamic = 'force-dynamic';

/** §9: a new section starts Keeper-only, which is what prep is. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const keeper = await requireKeeper();
    const { id } = await ctx.params;
    return json({ sectionId: createSection(id, keeper.id) });
  } catch (err) {
    return apiError(err);
  }
}
