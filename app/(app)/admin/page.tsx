import Link from 'next/link';
import { LivePage } from '@/components/live/LivePage';
import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { AdminTabs, type AdminPane } from '@/components/admin/AdminTabs';
import { NewTypeForm } from '@/components/admin/NewTypeForm';
import { SiteForm } from '@/components/admin/SiteForm';
import { TypeEditor } from '@/components/admin/TypeEditor';
import { WordsForm } from '@/components/admin/WordsForm';
import { Icon } from '@/components/Icon';
import { getSessionUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { relativeTime } from '@/lib/diff';
import { listArchivedThings, listBoardRevisions, listCaseRevisions, listTrash } from '@/lib/admin/trash';
import { listTypesForAdmin } from '@/lib/admin/types';
import { getWordOverrides } from '@/lib/admin/words';
import { resolveWords } from '@/lib/words';
import { charactersWorn } from '@/lib/characters';
import { listPendingEdits } from '@/lib/entries/review';
import {
  approveEditAction,
  regenerateInviteAction,
  rejectEditAction,
  restoreAction,
  restoreBoardRevisionAction,
  restoreCaseRevisionAction,
} from './actions';
import { UserRow } from './UserRow';

export const dynamic = 'force-dynamic';

/** What each audit action is called in Dutch. Anything unknown shows its key. */
const AUDIT_LABELS: Record<string, string> = {
  'password.revealed': 'wachtwoord getoond',
  'password.set_by_keeper': 'nieuw wachtwoord ingesteld',
  'user.promoted': 'tot Keeper gemaakt',
  'user.demoted': 'als Keeper afgezet',
  'user.enabled': 'account ingeschakeld',
  'user.disabled': 'account uitgeschakeld',
  'invite.regenerated': 'uitnodigingscode vernieuwd',
  'entry.visibility_changed': 'zichtbaarheid van een artikel gewijzigd',
  'entry.locked': 'artikel vergrendeld',
  'entry.unlocked': 'artikel ontgrendeld',
  'entry.revealed': 'artikel onthuld aan spelers',
  'entry.deleted': 'artikel verwijderd',
  'entry.restored': 'artikel teruggezet',
  'section.created': 'sectie toegevoegd',
  'section.deleted': 'sectie verwijderd',
  'section.visibility_changed': 'zichtbaarheid van een sectie gewijzigd',
  'section.revealed': 'sectie onthuld aan spelers',
  'pending_edit.approved': 'voorstel goedgekeurd',
  'pending_edit.rejected': 'voorstel afgewezen',
  'case.restored': 'dossier teruggezet',
  'case.restored_revision': 'eerdere versie van een dossier teruggezet',
  'board.restored': 'prikbord teruggezet',
  'board.restored_revision': 'eerdere versie van een prikbord teruggezet',
  'entry_type.created': 'soort artikel aangemaakt',
  'entry_type.edited': 'soort artikel bewerkt',
  'entry_type.deleted': 'soort artikel verwijderd',
  'site.settings_changed': 'site-instellingen gewijzigd',
  'site.logo_changed': 'logo gewijzigd',
  'site.words_changed': 'woorden van het archief gewijzigd',
  'archive.exported': 'archief gedownload',
};

const TRASH_KINDS: Record<string, string> = { entry: 'Artikel', case: 'Dossier', board: 'Prikbord' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; board?: string }>;
}) {
  const me = await getSessionUser();
  if (!me?.isKeeper) notFound();
  const query = await searchParams;

  const accounts = db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      isKeeper: schema.users.isKeeper,
      isDisabled: schema.users.isDisabled,
      lastSeenAt: schema.users.lastSeenAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.usernameLower))
    .all();
  // §18: which character each account is wearing, so the Keeper can tell
  // "Bram" from "Onderzoeker Van Dijk" without asking.
  const worn = charactersWorn(accounts.map((a) => a.id));
  const users = accounts.map((a) => ({ ...a, character: worn.get(a.id) ?? null }));

  const settings = db.select().from(schema.siteSettings).where(eq(schema.siteSettings.id, 1)).get();
  const pending = listPendingEdits();
  const types = listTypesForAdmin();
  const wordOverrides = getWordOverrides();
  const words = resolveWords(wordOverrides);
  // What a self-filling list may look through, and which of their fields point
  // at another fiche — passed once rather than fetched per type editor.
  const typeChoices = types.map((type) => ({
    slug: type.slug,
    label: type.label,
    fields: type.fields,
  }));
  const trash = listTrash();
  const archived = listArchivedThings();
  const caseRevisions = query.case ? listCaseRevisions(query.case) : [];
  const boardRevisions = query.board ? listBoardRevisions(query.board) : [];

  const audit = db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      createdAt: schema.auditLog.createdAt,
      meta: schema.auditLog.meta,
      actorName: schema.users.username,
    })
    .from(schema.auditLog)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditLog.actorId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(120)
    .all();

  const panes: AdminPane[] = [
    {
      key: 'users',
      label: words.adminUsers,
      icon: 'you',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>Uitnodigingscode</h2>
          <div className="row-wrap">
            <code className="invite-code">{settings?.inviteCode}</code>
            <form action={regenerateInviteAction}>
              <button className="btn btn-small" type="submit">
                Vernieuwen
              </button>
            </form>
          </div>
          <p className="tiny muted">
            Iedereen met deze code kan zich inschrijven. Bij vernieuwen vervalt de oude code.
          </p>

          <h2 style={{ marginTop: '1.6rem' }}>{words.adminUsers}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {users.map((user) => (
              <UserRow key={user.id} user={user} isSelf={user.id === me.id} />
            ))}
          </ul>
        </>
      ),
    },
    {
      key: 'review',
      label: words.adminReview,
      icon: 'check',
      badge: pending.length,
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>Beoordelingswachtrij</h2>
          {!pending.length ? (
            <div className="empty">
              <p style={{ margin: 0 }}>Niets te beoordelen.</p>
              <p className="small" style={{ margin: '0.4rem 0 0' }}>
                Bewerkingen van spelers op een vergrendeld {words.entry} komen hier terecht.
              </p>
            </div>
          ) : (
            pending.map((item) => (
              <div key={item.id} className="review-card">
                <div className="row-wrap" style={{ marginBottom: '0.5rem' }}>
                  <strong>
                    <Link href={`/e/${item.entrySlug}`}>{item.entryName}</Link>
                  </strong>
                  <span className="tiny muted">
                    voorgesteld door {item.proposedByName ?? 'iemand'} ·{' '}
                    {relativeTime(item.createdAt)}
                  </span>
                </div>

                {item.fields.length === 0 ? (
                  <p className="tiny muted">Dit voorstel verandert niets meer.</p>
                ) : (
                  item.fields.map((field) => (
                    <div key={field.key} style={{ marginBottom: '0.6rem' }}>
                      <p className="eyebrow" style={{ margin: '0 0 0.2rem' }}>
                        {field.label}
                      </p>
                      <div className="review-diff">
                        <div>
                          <p className="tiny muted" style={{ margin: '0 0 0.2rem' }}>
                            Nu
                          </p>
                          <pre className="review-side review-before">{field.before || '—'}</pre>
                        </div>
                        <div>
                          <p className="tiny muted" style={{ margin: '0 0 0.2rem' }}>
                            Voorstel
                          </p>
                          <pre className="review-side review-after">{field.after || '—'}</pre>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <form className="row-wrap" style={{ marginTop: '0.4rem' }}>
                  <input type="hidden" name="pendingId" value={item.id} />
                  <label className="visually-hidden" htmlFor={`note-${item.id}`}>
                    Bericht aan {item.proposedByName ?? 'de speler'}
                  </label>
                  <input
                    id={`note-${item.id}`}
                    className="input"
                    name="note"
                    placeholder="Bericht aan de speler (niet verplicht)"
                    style={{ flex: '1 1 14rem' }}
                  />
                  <button className="btn btn-small btn-primary" formAction={approveEditAction}>
                    <Icon name="check" size={15} />
                    Goedkeuren
                  </button>
                  <button className="btn btn-small btn-danger" formAction={rejectEditAction}>
                    Afwijzen
                  </button>
                </form>
              </div>
            ))
          )}
        </>
      ),
    },
    {
      key: 'types',
      label: words.adminTypes,
      icon: 'book',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>{words.adminTypes}</h2>
          <p className="small muted" style={{ maxWidth: '46rem' }}>
            Naam, pictogram, kleur, rand en velden — en wat een {words.entry} van deze soort op zijn pagina
            heeft staan: welke blokken, in welke volgorde, en welke lijsten. Bestaande {words.entryPlural} houden
            wat ze hadden; een veld of lijst die je weghaalt en terugzet, brengt zijn waarde weer
            mee.
          </p>
          {types.map((type) => (
            <TypeEditor key={type.id} type={type} types={typeChoices} words={words} />
          ))}
          <NewTypeForm />
        </>
      ),
    },
    {
      key: 'words',
      label: words.adminWords,
      icon: 'book',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>{words.adminWords}</h2>
          <WordsForm overrides={wordOverrides} />
        </>
      ),
    },
    {
      key: 'trash',
      label: words.adminTrash,
      icon: 'trash',
      badge: trash.length,
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>{words.adminTrash}</h2>
          <p className="small muted">
            Niets wordt echt gewist. Alles wat hier staat kun je terugzetten waar het stond.
          </p>
          {!trash.length ? (
            <div className="empty">
              <p style={{ margin: 0 }}>De prullenbak is leeg.</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {trash.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="row"
                  style={{ borderBottom: '1px solid var(--rule)', padding: '0.5rem 0' }}
                >
                  <span className="chip">{TRASH_KINDS[item.kind]}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{item.name}</strong>
                    {item.detail && (
                      <span className="tiny muted clamp-2" style={{ display: 'block' }}>
                        {item.detail}
                      </span>
                    )}
                  </span>
                  <span className="tiny muted">{relativeTime(item.deletedAt)}</span>
                  <form action={restoreAction}>
                    <input type="hidden" name="kind" value={item.kind} />
                    <input type="hidden" name="id" value={item.id} />
                    <button className="btn btn-small" type="submit">
                      Terugzetten
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    {
      key: 'history',
      label: words.adminHistory,
      icon: 'clock',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>Geschiedenis van dossiers en prikborden</h2>
          <p className="small muted">
            De geschiedenis van een {words.entry} staat op het {words.entry} zelf. Dossiers en prikborden bewaren
            hun eigen momentopnamen; kies er een om terug te zetten.
          </p>

          <h3 style={{ marginTop: '1.2rem' }}>Dossiers</h3>
          <div className="chip-strip">
            {archived.cases.map((item) => (
              <Link
                key={item.id}
                className={`chip chip-selectable${query.case === item.id ? ' chip-active' : ''}`}
                href={`/admin?case=${item.id}`}
              >
                {item.name}
              </Link>
            ))}
            {!archived.cases.length && <span className="tiny muted">Nog geen dossiers.</span>}
          </div>
          {query.case && (
            <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0 }}>
              {caseRevisions.map((revision) => (
                <li
                  key={revision.id}
                  className="row"
                  style={{ borderBottom: '1px solid var(--rule)', padding: '0.4rem 0' }}
                >
                  <span className="small" style={{ flex: 1 }}>
                    {revision.editedByName ?? 'Iemand'}
                  </span>
                  <span className="tiny muted">{relativeTime(revision.createdAt)}</span>
                  <form action={restoreCaseRevisionAction}>
                    <input type="hidden" name="revisionId" value={revision.id} />
                    <button className="btn btn-small" type="submit">
                      Terugzetten
                    </button>
                  </form>
                </li>
              ))}
              {!caseRevisions.length && <li className="tiny muted">Nog geen versies.</li>}
            </ul>
          )}

          <h3 style={{ marginTop: '1.4rem' }}>Prikborden</h3>
          <div className="chip-strip">
            {archived.boards.map((item) => (
              <Link
                key={item.id}
                className={`chip chip-selectable${query.board === item.id ? ' chip-active' : ''}`}
                href={`/admin?board=${item.id}`}
              >
                {item.name}
              </Link>
            ))}
            {!archived.boards.length && <span className="tiny muted">Nog geen prikborden.</span>}
          </div>
          {query.board && (
            <ul style={{ listStyle: 'none', margin: '0.6rem 0 0', padding: 0 }}>
              {boardRevisions.map((revision) => (
                <li
                  key={revision.id}
                  className="row"
                  style={{ borderBottom: '1px solid var(--rule)', padding: '0.4rem 0' }}
                >
                  <span className="small" style={{ flex: 1 }}>
                    {revision.editedByName ?? 'Iemand'}
                  </span>
                  <span className="tiny muted">{relativeTime(revision.createdAt)}</span>
                  <form action={restoreBoardRevisionAction}>
                    <input type="hidden" name="revisionId" value={revision.id} />
                    <button className="btn btn-small" type="submit">
                      Terugzetten
                    </button>
                  </form>
                </li>
              ))}
              {!boardRevisions.length && <li className="tiny muted">Nog geen versies.</li>}
            </ul>
          )}
        </>
      ),
    },
    {
      key: 'site',
      label: words.adminSite,
      icon: 'home',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>{words.adminSite}</h2>
          <SiteForm
            name={settings?.name ?? ''}
            tagline={settings?.tagline ?? ''}
            accent={(settings?.theme as { accent?: string })?.accent ?? ''}
            logoAssetId={settings?.logoAssetId ?? null}
            intro={settings?.intro ?? ''}
          />
        </>
      ),
    },
    {
      key: 'export',
      label: words.adminExport,
      icon: 'box',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>Alles downloaden</h2>
          <p className="small muted" style={{ maxWidth: '46rem' }}>
            Eén zip met elke tabel als JSON en elke afbeelding. Dezelfde zip die elke nacht in{' '}
            <code>/data/backups</code> wordt weggeschreven, waar de laatste veertien bewaard
            blijven. Hiermee verhuis je het hele archief naar een andere machine.
          </p>
          <a className="btn btn-primary" href="/api/admin/export" download>
            <Icon name="box" size={16} />
            Alles downloaden
          </a>
        </>
      ),
    },
    {
      key: 'audit',
      label: words.adminAudit,
      icon: 'shield',
      content: (
        <>
          <h2 style={{ marginTop: 0 }}>{words.adminAudit}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {audit.map((row) => {
              const meta = (row.meta ?? {}) as { username?: string; name?: string; title?: string };
              const about = meta.username ?? meta.name ?? meta.title;
              return (
                <li
                  key={row.id}
                  className="row"
                  style={{ borderBottom: '1px solid var(--rule)', padding: '0.35rem 0' }}
                >
                  <span className="small" style={{ flex: 1 }}>
                    <strong>{row.actorName ?? 'systeem'}</strong> —{' '}
                    {AUDIT_LABELS[row.action] ?? row.action}
                    {about ? ` (${about})` : ''}
                  </span>
                  <span className="tiny muted">{relativeTime(row.createdAt)}</span>
                </li>
              );
            })}
            {!audit.length && <li className="muted small">Nog niets vastgelegd.</li>}
          </ul>
        </>
      ),
    },
  ];

  return (
    <div className="page">
      <LivePage place="page:/admin" watch={['admin', 'types', 'words', 'site', 'users', 'entries', 'cases', 'boards', 'maps']} />
      <p className="eyebrow">{words.keeper}</p>
      <h1 style={{ marginBottom: 0 }}>{words.adminTitle}</h1>
      <AdminTabs panes={panes} />
    </div>
  );
}
