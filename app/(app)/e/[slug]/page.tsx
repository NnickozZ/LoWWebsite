import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryView } from '@/components/entry/EntryView';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getSessionUser } from '@/lib/auth/session';
import { activeCharacter, displayNames, listCharacters, playersOf } from '@/lib/characters';
import { canReview, listPendingEdits } from '@/lib/entries/review';
import { diffLines, relativeTime } from '@/lib/diff';
import { docToText } from '@/lib/entries/doc';
import { listCasesForEntry } from '@/lib/cases/service';
import {
  listCasesWithMembers,
  listEntryReveals,
  listRevealableUsers,
  listSections,
} from '@/lib/entries/secrets';
import { listDerivedEntries } from '@/lib/entries/derived';
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
import { listMaps, listPinsForEntry } from '@/lib/maps/service';
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
  const revisions = listRevisions(entry.id);
  const knownTags = listAllTags(user);
  const cases = listCasesForEntry(entry.id, user);
  const isKeeper = Boolean(user?.isKeeper);

  // §11: what this soort's page is made of, and the words it uses.
  const words = getWords();

  // §18: history rows carry the account; the page shows the character.
  const editorNames = displayNames(
    revisions.flatMap((r) =>
      r.editedBy ? [{ id: r.editedBy, username: r.username ?? '', isKeeper: Boolean(r.isKeeper) }] : [],
    ),
    words.keeper,
  );

  // §18: is this fiche one of the viewer's characters, and who else plays it?
  const mine = user && !user.isKeeper ? listCharacters(user.id) : [];
  const wornId = user && !user.isKeeper ? (activeCharacter(user.id)?.entryId ?? null) : null;
  const character = user && !user.isKeeper
    ? { linked: mine.some((c) => c.entryId === entry.id), active: wornId === entry.id }
    : null;
  const playedBy = playersOf(entry.id)
    .filter((p) => p.id !== user?.id)
    .map((p) => p.username);

  // §19: where this fiche is on the maps, and which maps it could still go on.
  const entryPins = listPinsForEntry(entry.id);
  const onMaps = entryPins.map((pin) => ({ pinId: pin.pinId, mapSlug: pin.mapSlug, mapName: pin.mapName }));
  const pinnedMapIds = new Set(entryPins.map((pin) => pin.mapId));
  const mapsToPlace = listMaps(user)
    .filter((map) => !pinnedMapIds.has(map.id))
    .map((map) => ({ slug: map.slug, name: map.name }));
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
        name: displayNames([{ id: user.id, username: user.username, isKeeper: user.isKeeper }], words.keeper).get(user.id)?.label ?? user.username,
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
                Nog niets. Deze lijst vult zichzelf zodra een fiche hiernaar wijst.
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
            <span className="muted">({backlinks.length})</span>
          </summary>
          <div style={{ padding: '0.6rem 0 1rem' }}>
            {block.note && (
              <p className="tiny muted" style={{ margin: '0 0 0.5rem' }}>
                {block.note}
              </p>
            )}
            {backlinks.length ? (
              <div className="card-grid">
                {backlinks.map((item) => (
                  <EntryCard key={item.id} entry={item} />
                ))}
              </div>
            ) : (
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
                    <span title={revision.editedBy ? editorNames.get(revision.editedBy)?.account : undefined}>
                      {(revision.editedBy && editorNames.get(revision.editedBy)?.label) ?? 'Iemand'}
                    </span>
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

  return (
    <>
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
          keeperNotes: entry.keeperNotes ?? '',
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
        revealUsers={revealUsers}
        revealCases={revealCases}
        access={access}
        proposals={proposals}
        character={character}
        playedBy={playedBy}
        onMaps={onMaps}
        mapsToPlace={mapsToPlace}
        openAddMore={query.new === '1'}
        cases={cases.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          confidential: item.viewMode !== 'all',
        }))}
      />

      {mayEdit && (
      <div className="page">
        <details className="section">
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
      </div>
      )}
    </>
  );
}
