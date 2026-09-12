import type { ReactNode } from 'react';
import { entryFieldsRoomKey, entryKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EntryView } from '@/components/entry/EntryView';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { sideOf } from '@/lib/keeper/kinds';
import { queryTail, sideDetour } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
import { PreferredCases } from '@/components/entry/PreferredCases';
import { caseIdsInFields } from '@/lib/entries/caseFields';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getSessionUser } from '@/lib/auth/session';
import { activeCharacter, attributed, listCharacters, playersOf, windowPresenceName } from '@/lib/characters';
import { canReview, listPendingEdits } from '@/lib/entries/review';
import { diffLines, relativeTime } from '@/lib/diff';
import { docToText } from '@/lib/entries/doc';
import { listCasesForEntry, resolveCaseRefs } from '@/lib/cases/service';
import {
  listCasesWithMembers,
  listEntryReveals,
  listRevealableUsers,
  listSections,
} from '@/lib/entries/secrets';
import { listDerivedEntries } from '@/lib/entries/derived';
import { groupMentions, listMentions } from '@/lib/entries/mentions';
import {
  getBacklinks,
  getEntryBySlug,
  getRevision,
  listAllTags,
  listRevisions,
} from '@/lib/entries/service';
import { getWords } from '@/lib/admin/words';
import { presenceColour } from '@/lib/boards/live';
import { snapshot } from '@/lib/live/docs';
import { admit, entryRoomKey, sectionRoomKey } from '@/lib/live/rooms';
import { listMaps, listMapsOfEntry, listPinsForEntry } from '@/lib/maps/service';
import { listEventsForEntry, listTimelines } from '@/lib/timelines/service';
import { formatWhen } from '@/lib/timelines/time';
import { viewerCanEdit } from '@/lib/access';
import { cleanTypeText, defaultBlockTitle, resolveBlocks } from '@/lib/pageBlocks';
import { deleteEntryAction, restoreRevisionAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new?: string; rev?: string }>;
}) {
  const user = await getSessionUser();
  const { slug } = await params;
  const query = await searchParams;

  const entry = getEntryBySlug(slug, user);
  if (!entry) notFound();

  /*
   * §50: the page decides where you stand. A Keeper who arrives on an artikel
   * from the other side is turned over *before* anything renders, through the
   * one writer of the side cookie — so the shell, the palette and every picker
   * below are built for the side this artikel is actually on. The query rides
   * along, because `?new=1` and `?rev=` are the address, not decoration.
   */
  const detour = sideDetour(user, entry.visibility === 'keeper', `/e/${entry.slug}${queryTail(query)}`);
  if (detour) redirect(detour);

  // §17: what this viewer may do here. The dials themselves only travel to the
  // owner or a Keeper; everyone else gets the one bit they need — may I edit.
  const grant = user ? grantFor('entry', entry.id, user.id) : null;
  const mayEdit = canEdit(entry, user, grant);
  const mayManage = canManageAccess(entry, user);
  const access = {
    settings: mayManage || (entry.accessLocked && entry.createdBy === user?.id)
      ? accessSettings(entry, 'entry', entry.id)
      : {
          ownerId: null,
          viewMode: entry.viewMode,
          editMode: entry.editMode,
          locked: entry.accessLocked,
          viewers: [],
          editors: [],
        },
    canManage: mayManage,
    canEdit: mayEdit,
    viewerId: user?.id ?? '',
  };
  const proposals = user && canReview(entry.id, user) ? listPendingEdits(entry.id) : [];

  const backlinks = getBacklinks(entry.id, user);
  /*
   * §27: everything else that names this artikel — a dossier's notes, another
   * artikel's infobox or one of its sections, a card on a prikbord, a speld on
   * a landkaart. Read here, on the server, behind each source's own visibility
   * rule (rule 7): a dossier this reader may not open is not in the list and
   * not in their HTML, because "an investigation you cannot see mentions you"
   * gives the investigation away just as loudly as naming it would.
   */
  const mentions = listMentions(entry.id, user);
  const mentionGroups = groupMentions(mentions);
  const revisionRows = listRevisions(entry.id);
  const knownTags = listAllTags(user);
  const cases = listCasesForEntry(entry.id, user);
  const isKeeper = Boolean(user?.isKeeper);

  /*
   * §24: where this artikel came from, resolved here rather than in the
   * browser. `resolveCaseRefs` is the same lookup an infobox uses — behind
   * `visibleCaseCondition` — so a herkomst-dossier this reader may not open
   * simply has no name to print, and the eyebrow is not there at all. The
   * control is offered where the question means something: a soort that only
   * exists inside a dossier, or an artikel that already has one.
   */
  const originRef = entry.originCaseId
    ? resolveCaseRefs([entry.originCaseId], user)[entry.originCaseId]
    : undefined;
  const origin = {
    case: originRef ? { id: originRef.id, slug: originRef.slug, name: originRef.name } : null,
    pinned: Boolean(entry.originPinned),
    /*
     * §49: the tickbox, and the shelves it can point at. `offer` is what makes
     * the eyebrow appear at all: an artikel with a dossier, or one that could
     * have one, or one already wearing the name of a dossier it has lost.
     * `canEdit` is per dossier (§17) — taking an artikel off a shelf is editing
     * *that* dossier, not this artikel, and the API says so too.
     */
    prefix: Boolean(entry.casePrefix),
    offer: Boolean(entry.originCaseId) || Boolean(entry.casePrefix) || cases.length > 0,
    cases: cases.map((item) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      canEdit: viewerCanEdit('case', item.id, user),
    })),
  };

  // §11: what this soort's page is made of, and the words it uses.
  const words = getWords();

  /*
   * §18b: a history row says which onderzoeker wrote it, and the page prints
   * *that* — not whoever the account is wearing now. `attributed` reads the
   * recorded id and falls back to the live lookup for rows written before the
   * archive asked, so one account can stand in this list twice under two names.
   */
  const revisions = attributed(
    revisionRows.map((r) => ({
      ...r,
      actorId: r.editedBy,
      actorName: r.username,
      actorIsKeeper: Boolean(r.isKeeper),
    })),
    words.keeper,
  );

  // §18: is this fiche one of the viewer's characters, and who else plays it?
  const mine = user && !user.isKeeper ? listCharacters(user.id) : [];
  const wornId = user && !user.isKeeper ? (activeCharacter(user.id)?.entryId ?? null) : null;
  // §18c: koppelen is the Keeper's, and Beheer is where they do it — except
  // for the first onderzoeker of a speler who holds nobody, which is the door
  // §18b leaves open. `mine` is `listCharacters`, so a fiche in the prullenbak
  // does not go on counting as one held.
  const character = user && !user.isKeeper
    ? {
        linked: mine.some((c) => c.entryId === entry.id),
        active: wornId === entry.id,
        mayTie: mine.length === 0,
      }
    : null;
  const playedBy = playersOf(entry.id)
    .filter((p) => p.id !== user?.id)
    .map((p) => p.username);

  // §19: where this fiche is on the maps, and which maps it could still go on.
  // §17: all three reads are per viewer now — a landkaart whose dial shuts this
  // reader out must not be named here, on the page of an artikel pinned to it.
  const entryPins = listPinsForEntry(entry.id, user);
  const onMaps = entryPins.map((pin) => ({ pinId: pin.pinId, mapSlug: pin.mapSlug, mapName: pin.mapName }));
  const pinnedMapIds = new Set(entryPins.map((pin) => pin.mapId));
  /*
   * §50 (reverses §46's `bothSides` here): a picker offers this side only.
   * Since the wissel above, the browser's side is always the side of the page
   * you are standing on — so "the viewer's side" and "this artikel's side" are
   * one and the same question, and a sided list is exactly the landkaarten this
   * artikel may be pinned to.
   */
  const mapsToPlace = listMaps(user)
    .filter((map) => !pinnedMapIds.has(map.id))
    .map((map) => ({ slug: map.slug, name: map.name }));
  // §23: and the landkaarten that are a drawing *of* this artikel.
  const mapsOfThis = listMapsOfEntry(entry.id, user).map((map) => ({ slug: map.slug, name: map.name }));
  // §32: where this artikel is on the tijdlijnen, and which it could still go on.
  const entryEvents = listEventsForEntry(entry.id, user);
  const onTimelines = entryEvents.map((row) => ({
    eventId: row.eventId,
    timelineSlug: row.timelineSlug,
    timelineName: row.timelineName,
    when: formatWhen(row.at, row.precision),
  }));
  const onTimelineIds = new Set(entryEvents.map((row) => row.timelineId));
  // §50: sided, for the same reason as the landkaarten above.
  const timelinesToPlace = listTimelines(user)
    .filter((timeline) => !onTimelineIds.has(timeline.id) && viewerCanEdit('timeline', timeline.id, user))
    .map((timeline) => ({ slug: timeline.slug, name: timeline.name }));
  // §21: the dossiers this artikel's own fields point at. Only ids are stored;
  // the names are looked up here, behind the same visibility rule as every
  // other read, so a dossier the reader may not open is not named in their HTML.
  const caseLinks = resolveCaseRefs(
    caseIdsInFields(entry.typeFields, (entry.fields ?? {}) as Record<string, unknown>),
    user,
  );

  // §9: a player is handed only the sections they may read, and neither the
  // reveal lists nor the pickers — none of it reaches their HTML.
  const sections = listSections(entry.id, user);
  const revealUsers = isKeeper ? listRevealableUsers() : [];
  const revealCases = isKeeper ? listCasesWithMembers() : [];

  // §20: the shared text. The document is handed over in the page so the
  // editor has it before the line is open; the gate here is the same one the
  // line will apply, so a viewer never gets a room the line would refuse.
  const liveUser = user
    ? {
        // §21: a caret says who is here, so a Keeper is their account name.
        name: windowPresenceName(user, words.keeper),
        colour: presenceColour(user.id),
      }
    : null;
  const bodyAdmission = admit(entryRoomKey(entry.id), user);
  const liveBody =
    bodyAdmission && liveUser
      ? { room: bodyAdmission.spec.key, ...snapshot(bodyAdmission.spec), canEdit: bodyAdmission.canEdit, user: liveUser }
      : null;
  const liveSections = new Map<string, { room: string; state: string; canEdit: boolean }>();
  for (const section of sections) {
    const admission = admit(sectionRoomKey(section.id), user);
    if (admission) liveSections.set(section.id, { room: admission.spec.key, state: snapshot(admission.spec).state, canEdit: admission.canEdit });
  }

  const blocks = resolveBlocks(entry.typeBlocks);
  const typeText = cleanTypeText(entry.typePageText);
  const openHistory = Boolean(query.rev);

  const selectedRevision = query.rev ? getRevision(query.rev) : undefined;
  const diff =
    selectedRevision && selectedRevision.entryId === entry.id
      ? diffLines(
          docToText((selectedRevision.snapshot as { body?: unknown }).body ?? null),
          entry.bodyText,
        )
      : null;

  /**
   * §11. Every block that is a *read* of the archive is rendered here, on the
   * server, and handed to `EntryView` by block id. That is not tidiness: a
   * self-filling list is a query over entries, so it must run behind
   * `visibleEntryCondition` and its results must never travel to a player's
   * browser as props. `EntryView` only decides where each one lands.
   */
  const slots: Record<string, ReactNode> = {};

  /*
   * Each slot carries `key={block.id}` from birth. `EntryView` also wraps every
   * block in a keyed Fragment, so this looks redundant — it is not. These nodes
   * cross the server/client boundary as finished elements and are then placed
   * into an array by a file that is not this one; a key set here travels with
   * the node and holds wherever it lands, which is the only version of the
   * invariant that cannot be broken from a distance.
   */

  for (const block of blocks) {
    if (block.hidden) continue;

    if (block.kind === 'derived') {
      const rows = listDerivedEntries(entry.id, block, user);
      const heading = block.title || 'Lijst';
      slots[block.id] = (
        <details key={block.id} className="section" open={block.open}>
          <summary>
            {heading} <span className="muted">({rows.length})</span>
          </summary>
          <div style={{ padding: '0.6rem 0 1rem' }}>
            {block.note && (
              <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
                {block.note}
              </p>
            )}
            {rows.length ? (
              <div className="card-grid">
                {rows.map((item) => (
                  <EntryCard key={item.id} entry={item} />
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Nog niets. Deze lijst vult zichzelf zodra een {words.entry} hiernaar wijst.
              </p>
            )}
          </div>
        </details>
      );
      continue;
    }

    if (block.kind === 'backlinks') {
      slots[block.id] = (
        <details key={block.id} className="section" open={block.open || openHistory}>
          <summary>
            {block.title || defaultBlockTitle('backlinks', words)}{' '}
            <span className="muted">({backlinks.length + mentions.length})</span>
          </summary>
          <div style={{ padding: '0.6rem 0 1rem' }}>
            {block.note && (
              <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
                {block.note}
              </p>
            )}
            {backlinks.length > 0 && (
              <div className="card-grid">
                {backlinks.map((item) => (
                  <EntryCard key={item.id} entry={item} />
                ))}
              </div>
            )}
            {/*
              §27: the mentions that did not come from another artikel's body —
              a dossier's werkaantekeningen, an infobox field, a card on a wall,
              a speld on a landkaart. Grouped by where they came from, and only
              the groups that have something in them: §22's reading face prints
              what is filled in and leaves the rest out, and an empty heading is
              exactly the blank row that rule forbids.
            */}
            {mentionGroups.map((group) => (
              <div key={group.key} style={{ marginTop: '0.9rem' }}>
                <h3 className="tiny muted" style={{ margin: '0 0 0.35rem', fontWeight: 600 }}>
                  {words[group.word]}
                </h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {group.items.map((mention) => (
                    <li
                      key={`${mention.kind}:${mention.id}:${mention.detail}`}
                      className="row"
                      style={{ padding: '0.25rem 0' }}
                    >
                      <Icon name={group.icon} size={15} style={{ color: 'var(--ink-muted)' }} />
                      <Link className="small" href={mention.href}>
                        {mention.name}
                      </Link>
                      {mention.detail && <span className="tiny muted">— {mention.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!backlinks.length && !mentions.length && (
              <p className="muted small" style={{ margin: 0 }}>
                {typeText.noBacklinks ?? (
                  <>
                    Nog niets verwijst hiernaar. Typ <code>@{entry.name}</code> in een andere{' '}
                    {words.entry}.
                  </>
                )}
              </p>
            )}
          </div>
        </details>
      );
      continue;
    }

    if (block.kind === 'history') {
      slots[block.id] = (
        <details key={block.id} className="section" open={block.open || openHistory}>
          <summary>
            {block.title || defaultBlockTitle('history', words)}{' '}
            <span className="muted">({revisions.length})</span>
          </summary>
          <div style={{ padding: '0.6rem 0 1rem' }}>
            {diff && selectedRevision && (
              <div
                style={{
                  border: '1px solid var(--rule)',
                  background: 'var(--paper-raised)',
                  padding: '0.7rem',
                  marginBottom: '0.8rem',
                }}
              >
                <div className="row-wrap" style={{ marginBottom: '0.5rem' }}>
                  <strong className="small">
                    {relativeTime(selectedRevision.createdAt)} vergeleken met nu
                  </strong>
                  <div className="spacer" />
                  <form action={restoreRevisionAction}>
                    <input type="hidden" name="revisionId" value={selectedRevision.id} />
                    <button className="btn btn-small" type="submit">
                      Deze versie terugzetten
                    </button>
                  </form>
                  <Link className="btn btn-small btn-ghost" href={`/e/${entry.slug}`}>
                    Sluiten
                  </Link>
                </div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--sans)',
                    fontSize: '0.9rem',
                  }}
                >
                  {diff.length === 0 && <span className="muted">Geen wijzigingen in de tekst.</span>}
                  {diff.map((line, index) => (
                    <div
                      key={index}
                      style={{
                        color:
                          line.kind === 'added'
                            ? 'var(--link)'
                            : line.kind === 'removed'
                              ? 'var(--stamp-red)'
                              : 'inherit',
                        textDecoration: line.kind === 'removed' ? 'line-through' : undefined,
                      }}
                    >
                      {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
                      {line.text}
                    </div>
                  ))}
                </pre>
              </div>
            )}

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="row"
                  style={{ borderBottom: '1px solid var(--rule)', padding: '0.4rem 0' }}
                >
                  <Icon name="clock" size={15} style={{ color: 'var(--ink-muted)' }} />
                  <span className="small" style={{ flex: 1 }}>
                    <span title={revision.actorAccount ?? undefined}>{revision.actorLabel ?? 'Iemand'}</span>
                    {revision.note ? ` — ${revision.note}` : ''}
                  </span>
                  <span className="tiny muted">{relativeTime(revision.createdAt)}</span>
                  <Link
                    className="btn btn-small btn-ghost"
                    href={`/e/${entry.slug}?rev=${revision.id}`}
                  >
                    Bekijken
                  </Link>
                </li>
              ))}
              {!revisions.length && <li className="muted small">Nog geen versies vastgelegd.</li>}
            </ul>
          </div>
        </details>
      );
    }
  }

  /*
   * §44: the Keeper's corner — the switch to the other face, the "this page is
   * mine" toggle, the touwtjes and the shared notes. A slot for the same reason
   * every other one is: it is a read of the archive (`keeperRef`, `tiesFor`,
   * the notes room), so it is done on the server and never travels to a
   * player's browser as props. It stands under "Beheer van dit artikel", where
   * the keeper-notes box used to be.
   */
  if (isKeeper) {
    slots.keeper = <KeeperPanelServer key="keeper" kind="entry" id={entry.id} user={user} />;
  }

  // The bin: a server action, so it is made here and handed over as a slot
  // like the other reads — EntryView files it under "Beheer van dit artikel".
  if (mayEdit) {
    slots.delete = (
      <details key="delete" className="section">
        <summary>{words.deleteEntry}</summary>
        <div style={{ padding: '0.6rem 0 1.5rem' }}>
          <p className="small muted">
            Niets wordt echt gewist — een {words.keeper} kan dit terughalen uit de prullenbak.
          </p>
          <form action={deleteEntryAction}>
            <input type="hidden" name="entryId" value={entry.id} />
            <button className="btn btn-small btn-danger" type="submit">
              <Icon name="trash" size={14} />
              Naar de prullenbak
            </button>
          </form>
        </div>
      </details>
    );
  }

  // §21: the name, the one-liner and the infobox texts as shared fields.
  const fieldsAdmission = admit(entryFieldsRoomKey(entry.id), user);
  const liveFields =
    fieldsAdmission && liveUser
      ? { room: fieldsAdmission.spec.key, state: snapshot(fieldsAdmission.spec).state, canEdit: fieldsAdmission.canEdit, user: liveUser }
      : null;

  return (
    <>
      <LivePage place={entryKey(entry.id)} watch={['cases', 'maps', 'types']} />
      {/* §44/§45/§46: which side this artikel is on — for every reader, not
          only a Keeper. The stamp says it in a word and the marker paints the
          page in that side's colours. §57: the marker also carries where the
          toggle goes from here — the tweeling when there is one, and otherwise
          the wiki, said as a fallback rather than as an address so the landing
          can explain itself. Who is told about a wissel is the shell's
          business now (`SideSwitched`), not this page's. */}
      <KeeperStamp
        side={sideOf(entry.visibility === 'keeper')}
        flipTo={twinOf('entry', entry.id, user)?.href}
        flipList="/wiki"
      />
      {/*
        §31: the dossiers this artikel is filed in — already behind
        `visibleCaseCondition`, because `listCasesForEntry` took this viewer.
        Every reference box under here offers what is in them first. A ranking
        and nothing more: rule 1 is untouched, and the boost is thrown away on
        the server for any dossier this viewer may not open.
      */}
      <PreferredCases ids={cases.map((item) => item.id)}>
      <EntryView
        entry={{
          id: entry.id,
          slug: entry.slug,
          name: entry.name,
          shortDescription: entry.shortDescription,
          body: entry.body,
          fields: entry.fields ?? {},
          tags: entry.tags ?? [],
          coverAssetId: entry.coverAssetId,
          coverCrop: entry.coverCrop,
          typeLabel: entry.typeLabel,
          typeIcon: entry.typeIcon,
          typeColour: entry.typeColour,
          typeFields: entry.typeFields ?? [],
          typeBlocks: blocks,
          typeText,
          visibility: entry.visibility,
          isLocked: entry.isLocked,
          revealedTo: isKeeper ? listEntryReveals(entry.id) : [],
        }}
        knownTags={knownTags}
        isKeeper={isKeeper}
        slots={slots}
        sections={sections.map((section) => ({
          id: section.id,
          title: section.title,
          body: section.body,
          visibility: section.visibility,
          revealedTo: section.revealedTo,
          live: liveSections.get(section.id) ?? null,
        }))}
        live={liveBody}
        liveFields={liveFields}
        revealUsers={revealUsers}
        revealCases={revealCases}
        access={access}
        proposals={proposals}
        character={character}
        playedBy={playedBy}
        onMaps={onMaps}
        mapsToPlace={mapsToPlace}
        mapsOfThis={mapsOfThis}
        onTimelines={onTimelines}
        timelinesToPlace={timelinesToPlace}
        origin={origin}
        caseLinks={caseLinks}
        /*
         * §22: everybody lands on the reading face, a Keeper included, and the
         * toggle crosses over. The only artikel that opens in Bewerken is one
         * made this second — `?new=1`, which is how the sheet lands you here.
         */
        openAddMore={query.new === '1'}
        cases={cases.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          confidential: item.viewMode !== 'all',
        }))}
      />
      </PreferredCases>
    </>
  );
}
