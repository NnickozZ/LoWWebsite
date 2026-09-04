import { requireKeeper } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { deleteSection, setSectionReveals, updateSection } from '@/lib/entries/secrets';
import type { Visibility } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const VISIBILITIES: Visibility[] = ['all', 'keeper', 'players'];

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const keeper = await requireKeeper();
    const { id } = await ctx.params;
    const body = (await request.json()) as {
      title?: string;
      body?: unknown;
      visibility?: string;
      sortOrder?: number;
      revealedTo?: string[];
    };

    updateSection(
      id,
      {
        title: body.title,
        body: body.body,
        sortOrder: body.sortOrder,
        visibility: VISIBILITIES.includes(body.visibility as Visibility)
          ? (body.visibility as Visibility)
          : undefined,
      },
      keeper.id,
    );

    if (Array.isArray(body.revealedTo)) {
      setSectionReveals(id, body.revealedTo.map(String), keeper.id);
    }

    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const keeper = await requireKeeper();
    const { id } = await ctx.params;
    deleteSection(id, keeper.id);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
