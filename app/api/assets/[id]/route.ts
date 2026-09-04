import { readAsset, type AssetVariant } from '@/lib/assets';
import { getSessionUser } from '@/lib/auth/session';

/**
 * Assets are behind the login like everything else. Cached hard once fetched:
 * an asset id never points at different bytes.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return new Response('Log eerst in.', { status: 401 });

  const { id } = await ctx.params;
  const wanted = new URL(request.url).searchParams.get('s');
  const variant: AssetVariant = wanted === 'thumb' || wanted === 'card' ? wanted : 'full';
  const asset = await readAsset(id, variant);
  if (!asset) return new Response('Niet gevonden', { status: 404 });

  return new Response(new Uint8Array(asset.body), {
    headers: {
      'content-type': asset.mime,
      'cache-control': 'private, max-age=31536000, immutable',
      'content-length': String(asset.body.byteLength),
    },
  });
}
