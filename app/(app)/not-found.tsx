import Link from 'next/link';

/**
 * Something inside the archive is not there — or not there *for you*.
 *
 * §40's rule is that a page you may not open answers 404 rather than "u mag
 * dit niet zien", because the refusal itself would say the thing exists. So
 * this page is read by two very different people and must be no help at all to
 * the second one: it names nothing and guesses nothing.
 *
 * §44 is why it exists at all. `notFound()` used to fall through to Next's own
 * page, which is drawn above this group and therefore without the shell — and
 * the shell is where the "kijk als speler" banner lives. A Keeper with the
 * preview on who walks into Beheer or de Keeperkant gets a 404, correctly, and
 * landed on a page with no menu and no way back. A `not-found` of this group's
 * own keeps the shell, the way `app/(app)/error.tsx` does for a throw, so the
 * banner is on screen wherever the preview takes them.
 */
export default function AppNotFound() {
  return (
    <div className="page">
      <div className="empty" style={{ textAlign: 'left' }}>
        {/*
         * The number is on the page on purpose. It is what a reader who ends
         * up here by mistake can repeat to somebody else, and it is what
         * `phase3-keeper-tools.spec.ts` looks for when it checks that a
         * Keeper-only artikel answers nothing at its own address.
         */}
        <p className="eyebrow">404</p>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.3rem' }}>Deze pagina is er niet.</h1>
        <p className="small" style={{ margin: '0 0 0.8rem' }}>
          Hij bestaat niet, of hij is niet van jou om te lezen. De rest van het archief staat er nog.
        </p>
        <div className="row-wrap">
          <Link className="btn btn-small btn-primary" href="/">
            Naar het begin
          </Link>
          <Link className="btn btn-small btn-ghost" href="/search">
            Zoeken
          </Link>
        </div>
      </div>
    </div>
  );
}
