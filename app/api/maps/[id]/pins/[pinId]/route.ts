import { requireUser } from '@/lib/auth/session';
import { apiError, json } from '@/lib/api';
import { removePin, updatePin } from '@/lib/maps/service';

export const dynamic = 'force-dynamic';

/** Move, rename or rewrite a pin: whoever set it, or a Keeper. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string; pinId: string }> }) {
  try {
    const user = await requireUser();
    const { pinId } = await ctx.params;
    const body = (await request.json()) as { x?: unknown; y?: unknown; name?: unknown; text?: unknown };
    const patch: { x?: number; y?: number; name?: string; text?: string } = {};
    if (typeof body.x === 'number') patch.x = body.x;
    if (typeof body.y === 'number') patch.y = body.y;
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.text === 'string') patch.text = body.text;
    return json({ pin: updatePin(pinId, patch, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; pinId: string }> }) {
  try {
    const user = await requireUser();
    const { pinId } = await ctx.params;
    removePin(pinId, user);
    return json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
