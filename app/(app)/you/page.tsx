import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { Icon } from '@/components/Icon';
import { MEANING } from '@/components/kamer/plekWords';
import { CharacterWardrobe } from '@/components/you/CharacterSwitcher';
import { WritingAsLine } from '@/components/you/AuthorProvider';
import { getWords } from '@/lib/admin/words';
import { requireViewer } from '@/lib/auth/session';
import { activeCharacter, listCharacters } from '@/lib/characters';
import { relativeTime } from '@/lib/diff';
import { listMyProposals } from '@/lib/entries/review';
import { purseOf } from '@/lib/kamers/service';
import { spelerHref } from '@/lib/spelers/service';
import { capitalise } from '@/lib/words';
import { ColourSchemeForm } from './ColourSchemeForm';
import { ReadingFontForm } from './ReadingFontForm';
import { ChangePasswordForm } from './ChangePasswordForm';
import { logoutAction, logoutEverywhereAction } from './actions';

export const dynamic = 'force-dynamic';

const PROPOSAL_STATUS: Record<string, string> = {
  pending: 'In behandeling',
  approved: 'Goedgekeurd',
  rejected: 'Afgewezen',
};

export default async function YouPage() {
  const user = await requireViewer();
  // §10: a locked entry sends a player's edit to the Keeper. This is where they
  // find out what came of it, and read the Keeper's note back.
  const proposals = user ? listMyProposals(user.id) : [];
  const words = getWords();
  // §84: waar je munten aan uitgeeft — zie de rij deuren hieronder.
  const purse = purseOf(user);

  // §18: the wardrobe. A Keeper's is empty by rule, not by accident.
  const me = user
    ? {
        id: user.id,
        username: user.username,
        isKeeper: user.isKeeper,
        characters: user.isKeeper ? [] : listCharacters(user.id),
        activeId: user.isKeeper ? null : (activeCharacter(user.id)?.entryId ?? null),
      }
    : null;
  const worn = me?.characters.find((c) => c.entryId === me.activeId) ?? null;
  // §77: this page is the account — the settings, the password, the wardrobe.
  // The spelerspagina is the person, and it is the one others can open too.
  const myPage = spelerHref(user?.id);

  return (
    <div className="page you-page">
      <LivePage place="page:/you" watch={['characters', 'users', 'entries']} />
      <p className="eyebrow">{words.yourAccount}</p>
      <h1>{user?.username}</h1>
      {/*
        §84: de rij deuren krijgt een naam, want hij had er geen en zijn
        knoppen bleven daardoor 34 px op een telefoon — onder de 44 die §69 6.1
        van alles vraagt wat een vinger raakt. De e2e-zaak die elke zichtbare
        knop meet, vond deze rij als enige.
      */}
      <p className="row-wrap you-doors">
        {user?.isKeeper && (
          <>
            <span className="stamp">{words.keeper}</span>
            <Link className="btn btn-small" href="/admin">
              <Icon name="shield" size={15} />
              {words.navAdmin}
            </Link>
          </>
        )}
        {/* §77: the door to your own front door — the page the rest of the
            archive sees you at. */}
        {/* §84: en de kamer. `/you` noemde de winkel en de hal en nooit de
            plek waar je munten aan uitgeeft — terwijl dit tot ronde 45 de enige
            pagina in de navigatie was waarlangs je er kwam. */}
        {purse && (
          <Link className="btn btn-small" href={`/kamer/${purse.slug}`} data-testid="you-kamer">
            <Icon name={MEANING.kamer} size={15} />
            {capitalise(words.room)}
          </Link>
        )}
        {myPage && (
          <Link className="btn btn-small" href={myPage}>
            <Icon name="person" size={15} />
            Jouw {words.spelerPage.toLowerCase()}
          </Link>
        )}
        {/* §81: en de hal, waar ze allemaal staan. */}
        <Link className="btn btn-small" href="/spelers">
          <Icon name="badge" size={15} />
          {words.spelerPagePlural}
        </Link>
        {/* §82: de etalage. Staat hier omdat het de enige plek is die niet
            aan één onderzoeker hangt — wie er twee draagt, koopt vanaf hier
            voor allebei. */}
        <Link className="btn btn-small" href="/winkel">
          <Icon name={MEANING.winkel} size={15} />
          {words.shop}
        </Link>
      </p>
      {worn && (
        <p className="small muted" style={{ marginTop: 0 }}>
          {words.playsAs} <strong>{worn.name}</strong>.
        </p>
      )}

      {me && (
        <>
          <hr className="rule" />
          <h2 id="karakters">{words.yourCharacters}</h2>
          {/*
           * §18b: the side menu has no room on a phone, so the wardrobe is
           * where a phone switches karakter — and therefore where the window's
           * onderzoeker has to be visible and changeable too.
           */}
          <WritingAsLine />
          <CharacterWardrobe me={me} />
        </>
      )}

      {proposals.length > 0 && (
        <>
          <hr className="rule" />
          <h2>Jouw voorstellen</h2>
          <p className="small muted">
            Bewerkingen die je op een vergrendeld {words.entry} hebt voorgesteld.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {proposals.map((proposal) => (
              <li
                key={proposal.id}
                style={{ borderBottom: '1px solid var(--rule)', padding: '0.5rem 0' }}
              >
                <div className="row-wrap">
                  <span
                    className={`chip${proposal.status === 'rejected' ? '' : ' chip-active'}`}
                  >
                    {PROPOSAL_STATUS[proposal.status] ?? proposal.status}
                  </span>
                  <Link href={`/e/${proposal.entrySlug}`} style={{ flex: 1, minWidth: 0 }}>
                    {proposal.entryName}
                  </Link>
                  <span className="tiny muted">
                    {relativeTime(proposal.reviewedAt ?? proposal.createdAt)}
                  </span>
                </div>
                {proposal.reviewNote && (
                  <p className="small" style={{ margin: '0.3rem 0 0', fontStyle: 'italic' }}>
                    “{proposal.reviewNote}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {user && (
        <>
          <hr className="rule" />
          <h2 id="lettertype">Lettertype</h2>
          <p className="small muted">
            Waarin je het archief leest. Alleen voor jou, op elk apparaat waar je inlogt.
          </p>
          <ReadingFontForm current={user.readingFont} />

          <hr className="rule" />
          {/* §45: het licht waarin je leest. Per account, net als het lettertype. */}
          <h2 id="kleuren">Kleuren</h2>
          <p className="small muted">
            In welk licht je het archief leest. Alleen voor jou, op elk apparaat waar je inlogt.
          </p>
          <ColourSchemeForm
            current={user.colourScheme}
            isKeeper={user.isKeeper}
            keeperWord={words.keeper}
          />
        </>
      )}

      <hr className="rule" />

      <h2>Wachtwoord wijzigen</h2>
      <ChangePasswordForm />

      <hr className="rule" />

      <div className="row-wrap">
        <form action={logoutAction}>
          <button className="btn" type="submit">
            Uitloggen
          </button>
        </form>
        <form action={logoutEverywhereAction}>
          <button className="btn btn-ghost" type="submit">
            Overal uitloggen
          </button>
        </form>
      </div>

      <p className="tiny muted" style={{ marginTop: '1.5rem' }}>
        De Keeper kan je wachtwoord terughalen als je het vergeet. Gebruik geen wachtwoord dat je
        ook ergens anders gebruikt.
      </p>
    </div>
  );
}
