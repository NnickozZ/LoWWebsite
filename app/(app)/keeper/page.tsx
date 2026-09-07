import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { LivePage } from '@/components/live/LivePage';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { listBoards } from '@/lib/boards/service';
import { listCases } from '@/lib/cases/service';
import { browseEntries } from '@/lib/entries/service';
import {
  KEEPER_KINDS,
  KIND_ICON,
  KIND_WORD_PLURAL,
  type KeeperKind,
  type KeeperRef,
} from '@/lib/keeper/kinds';
import { KeeperSideMark } from '@/components/keeper/KeeperSideMark';
import { keeperRef } from '@/lib/keeper/side';
import { pagePlace } from '@/lib/live/keys';
import { twinOf } from '@/lib/keeper/ties';
import { listMaps } from '@/lib/maps/service';
import { listTimelines } from '@/lib/timelines/service';

export const dynamic = 'force-dynamic';

/** How many keeper-only things of one kind this page will list. */
const CAP = 400;

/**
 * §44: de Keeperkant — everything on the Keeper's own side, in one list.
 *
 * A 404 for anybody else, not a locked door: the same answer a private
 * artikel, dossier or landkaart gives at its own address (§40), and the same
 * one Beheer gives. That includes a Keeper with "kijk als speler" on, who *is*
 * a player for the length of the request — the banner in the shell is their
 * way back, which is why it does not live on this page.
 *
 * Nothing is selected straight out of a table here. Each kind's candidates
 * come from the list function that carries its own visibility rule, and every
 * row printed has then been through `keeperRef` — so this page cannot be the
 * one place in the archive that names something its reader may not open.
 */
export default async function KeeperSidePage() {
  const user = await getSessionUser();
  if (!user?.isKeeper) notFound();
  const words = getWords();

  const candidates: Record<KeeperKind, string[]> = {
    // §14: `visibility` is honoured for a Keeper only, which this reader is.
    entry: browseEntries(user, { visibility: 'keeper', sort: 'name', limit: CAP }).map((row) => row.id),
    case: listCases(user, { sort: 'name' }).map((row) => row.id),
    board: listBoards(user, { sort: 'name' }).map((row) => row.id),
    map: listMaps(user, { sort: 'name' }).map((row) => row.id),
    timeline: listTimelines(user, { sort: 'name' }).map((row) => row.id),
  };

  const groups = KEEPER_KINDS.map((kind) => {
    const rows: { ref: KeeperRef; twin: KeeperRef | null }[] = [];
    for (const id of candidates[kind].slice(0, CAP)) {
      const ref = keeperRef(kind, id, user);
      if (!ref?.keeperOnly) continue;
      rows.push({ ref, twin: twinOf(kind, id, user) });
    }
    return { kind, rows };
  });
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  return (
    <div className="page-wide">
      {/*
       * §45: the Keeperkant is the Keeper's side by definition, so it wears
       * the Keeper's colours the way every keeper-only record's page does.
       * The mark, and not the stamp: the heading already says Keeperkant.
       */}
      <KeeperSideMark />
      {/*
       * §21: live like every other page. The five collection keys are what
       * this list is made of, so anything made, renamed, moved to the Keeper's
       * side or thrown away re-reads it. `page:/keeper` is not in
       * `PAGE_PLACES`, so the line quietly does not hand out presence here —
       * the one thing this page does without, and a one-line fix in
       * `lib/live/keys.ts` on the day somebody wants a dot on it.
       */}
      <LivePage
        place={pagePlace('/keeper')}
        watch={['entries', 'cases', 'boards', 'maps', 'timelines']}
      />
      <header style={{ marginBottom: '0.8rem' }}>
        <p className="eyebrow">
          <Icon name="shield" size={13} /> {words.keeper}
        </p>
        <h1 style={{ margin: 0 }}>{words.keeperSide}</h1>
        <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
          Alles wat alleen jij ziet. Een pagina komt hier te staan zodra je hem in zijn eigen
          Keeperkant-blok van jou maakt, of zodra je er een {words.keeperVersion.toLowerCase()} van
          maakt.
        </p>
      </header>

      {total === 0 ? (
        <div className="empty">
          <p className="small" style={{ margin: 0 }}>
            Nog niets aan deze kant. Open een {words.entry}, {words.case}, {words.board},{' '}
            {words.map} of {words.timeline} en druk op ‘{words.keeperVersion} maken’.
          </p>
        </div>
      ) : (
        groups
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <section key={group.kind} className="keeper-side-group">
              <h2 className="eyebrow">
                <Icon name={KIND_ICON[group.kind]} size={13} /> {words[KIND_WORD_PLURAL[group.kind]]}{' '}
                <span className="muted">({group.rows.length})</span>
              </h2>
              <ul className="keeper-side-list" data-testid={`keeper-side-${group.kind}`}>
                {group.rows.map(({ ref, twin }) => (
                  <li key={ref.id} className="row keeper-side-row">
                    <Link className="keeper-side-name" href={ref.href}>
                      {ref.name}
                    </Link>
                    {twin ? (
                      <Link className="tiny keeper-side-twin" href={twin.href}>
                        <Icon name="swap" size={12} /> {words.playerVersion}
                      </Link>
                    ) : (
                      <span className="tiny muted">Zonder spelerskant</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
