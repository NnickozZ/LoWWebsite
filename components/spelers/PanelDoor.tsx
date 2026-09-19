import Link from 'next/link';

/**
 * §77: the door out of a panel.
 *
 * A panel is a summary; the page it summarises is somewhere else. This is the
 * one line that says where, and it looks the same on every panel so that the
 * shape of the spelerspagina is "five summaries, five doors" rather than five
 * different inventions.
 */
export function PanelDoor({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="speler-panel-door">
      <Link className="small" href={href}>
        {children}
      </Link>
    </p>
  );
}
