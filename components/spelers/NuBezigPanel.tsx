import { NuBezigLive } from '@/components/spelers/NuBezigLive';
import type { SpelerLite } from '@/lib/spelers/service';
import type { Words } from '@/lib/words';

/**
 * §77, panel 1: where this person is right now.
 *
 * The server half is a **shell**, on purpose. Presence lives on the live line
 * (§21, §60), and the line is a thing a browser is connected to — a server
 * render knows nothing about it and may not go and ask, because reading the hub
 * from a server component would be a second answer to a question the roster
 * already answers, and a staler one.
 *
 * §76: so the body is a client component that reads the roster this browser has
 * already been sent. Nothing is fetched, nothing is gated here — the frame was
 * built for this viewer on the server, and a place they may not see arrived as
 * the placeholder before this file ever saw it.
 *
 * The fallback line is honest rather than empty: it does not claim the person
 * is away, it says nobody's window is on the line.
 */
export function NuBezigPanel({ speler, words }: { speler: SpelerLite; words: Words }) {
  return (
    <div className="speler-nu" data-testid="panel-nu-bezig-shell">
      <NuBezigLive href={`/spelers/${speler.slug}`} words={words} fallback="Niet online." />
    </div>
  );
}
