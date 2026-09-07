import { LivePage } from '@/components/live/LivePage';
import { WebView } from '@/components/web/WebView';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { clampDepth } from '@/lib/web/slice';
import { parseWebNodeId } from '@/lib/web/types';

export const dynamic = 'force-dynamic';

/**
 * §43: het web — the archive drawn as what points at what.
 *
 * The page is a shell; the drawing and everything around it is `WebView`,
 * which fetches the graph for *this* viewer from `/api/web` and slices it in
 * the browser. `?focus=entry:…` puts one thing in the middle, `?d=` says how
 * far out to look; without a focus it is the whole visible archive.
 */
export default async function WebPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[]; d?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const query = await searchParams;
  const words = getWords();
  const focusRaw = Array.isArray(query.focus) ? query.focus[0] : query.focus;
  const focus = focusRaw && parseWebNodeId(focusRaw) ? focusRaw : null;
  const depthRaw = Array.isArray(query.d) ? query.d[0] : query.d;

  return (
    <div className="page-wide">
      <div className="page-canvas">
        {/* §21: live like every page — but the drawing fetches its own graph,
            so it refetches on a change (`useLiveChanges` in WebView) rather
            than being re-rendered from the server, which would change nothing. */}
        <LivePage place="page:/web" pointers={false} refresh={false} />
        <header className="canvas-head">
          <p className="eyebrow">Alles wat aan elkaar hangt</p>
          <h1>{words.navWeb}</h1>
        </header>
        <WebView initialFocus={focus} initialDepth={clampDepth(depthRaw ?? 1)} isKeeper={Boolean(user?.isKeeper)} />
      </div>
    </div>
  );
}
