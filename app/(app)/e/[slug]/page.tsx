import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryView } from '@/components/entry/EntryView';
import { EntryCard } from '@/components/EntryCard';
import { Icon } from '@/components/Icon';
import { getSessionUser } from '@/lib/auth/session';
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

  const backlinks = getBacklinks(entry.id, user);
  const revisions = listRevisions(entry.id);
  const knownTags = listAllTags(user);
  const cases = listCasesForEntry(entry.id, user);
  const isKeeper = Boolean(user?.isKeeper);
  // §9: a player is handed only the sections they may read, and neither the
  // reveal lists nor the pickers — none of it reaches their HTML.
  const sections = listSections(entry.id, user);
  const revealUsers = isKeeper ? listRevealableUsers() : [];
  const revealCases = isKeeper ? listCasesWithMembers() : [];

  // §11: what this soort's page is made of, and the words it uses.
  const words = getWords();
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
                    {revision.username ?? 'Iemand'}
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
        }))}
        revealUsers={revealUsers}
        revealCases={revealCases}
        openAddMore={query.new === '1'}
        cases={cases.map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          visibility: item.visibility,
        }))}
      />

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
    </>
  );
}
