import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { getWords } from '@/lib/admin/words';

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
  // §102, golf h1 (D2): every word from the list (§11), so a Keeper can say it in
  // the archive's own voice. The layout has already asked for a viewer.
  const words = getWords();
  return (
    <div className="page">
      {/*
       * §102, golf h1 (D2, T13): a fiche from the archive's own drawer — paper, a
       * rule, a stamp — rather than a dashed "empty" box. It now also catches
       * every unknown address (`[...rest]`), so this is the page a mistyped
       * link lands on, and it should look like it belongs.
       */}
      <section className="niet-gevonden" aria-labelledby="niet-gevonden-titel">
        {/*
         * The number is on the page on purpose. It is what a reader who ends
         * up here by mistake can repeat to somebody else, and it is what
         * `phase3-keeper-tools.spec.ts` looks for when it checks that a
         * Keeper-only artikel answers nothing at its own address.
         */}
        <p className="eyebrow niet-gevonden-nummer">404</p>
        <span className="stamp niet-gevonden-stempel" aria-hidden="true">
          {words.notFoundStamp}
        </span>
        <h1 id="niet-gevonden-titel" className="niet-gevonden-titel">
          {words.notFoundTitle}
        </h1>
        <p className="niet-gevonden-tekst">{words.notFoundBody}</p>
        <div className="row-wrap niet-gevonden-deuren">
          <Link className="btn btn-primary" href="/">
            <Icon name="home" size={16} />
            {words.notFoundHome}
          </Link>
          <Link className="btn" href="/search">
            <Icon name="search" size={16} />
            {words.navSearch}
          </Link>
        </div>
      </section>
    </div>
  );
}
