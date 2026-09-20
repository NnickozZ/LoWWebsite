import Link from 'next/link';

/**
 * §77: the door out of a panel.
 *
 * A panel is a summary; the page it summarises is somewhere else. This is the
 * one line that says where, and it looks the same on every panel so that the
 * shape of the spelerspagina is "five summaries, five doors" rather than five
 * different inventions.
 *
 * **§85 gave it an arrow.** The doors were plain `.small` links sitting under a
 * list of `.small` links, so the one line on a panel that *leaves* the page
 * looked exactly like the four lines above it that do not. An arrow is the
 * cheapest thing that says "this one goes somewhere else", and it is drawn
 * here rather than typed into each caller so there is one of it.
 *
 * The caller brings the verb (*Naar de kamer*, not *Kamer*), because a door
 * named after its destination reads as a heading and a door named after what
 * it does reads as a door.
 */
export function PanelDoor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="speler-panel-door">
      <Link className="small" href={href}>
        {children}
        <span aria-hidden="true"> &rarr;</span>
      </Link>
    </p>
  );
}
