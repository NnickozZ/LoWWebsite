import { notFound } from 'next/navigation';
import { caseFieldsRoomKey, caseKey } from '@/lib/live/keys';
import { LivePage } from '@/components/live/LivePage';
import { asc } from 'drizzle-orm';
import { CaseDossier, type CaseGroup } from '@/components/cases/CaseDossier';
import { KeeperPanelServer } from '@/components/keeper/KeeperPanelServer';
import { KeeperStamp } from '@/components/keeper/KeeperStamp';
import { sideOf } from '@/lib/keeper/kinds';
import { keeperRef } from '@/lib/keeper/side';
import { twinOf } from '@/lib/keeper/ties';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { attributed, charactersWorn, displayNames, windowPresenceName } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { snapshot } from '@/lib/live/docs';
import { admit, caseRoomKey } from '@/lib/live/rooms';
import { listBoardsForCase } from '@/lib/boards/service';
import { listTimelinesForCase } from '@/lib/timelines/service';
import {
  getCaseBySlug,
  listCaseActivity,
  listCaseEntries,
  listCaseMembers,
} from '@/lib/cases/service';
import { listEntryTypes } from '@/lib/entries/service';
import { planCaseTabs, type CaseTabSource } from '@/lib/cases/tabs';
import { Icon } from '@/components/Icon';
import { deleteCaseAction } from './actions';

export const dynamic = 'force-dynamic';

/** §7's tab list. Anything else keeps its own tab so nothing filed here is lost. */
const MERGED_PEOPLE = { key: 'people', label: 'Personen', typeSlugs: ['character', 'investigator'] };
// §24: the two soorten that are made here come first after the people — they
// are what an investigation actually produces. *Which* two is asked of the
// soorten themselves (`caseOnly`), not written down as slugs: §11 lets a Keeper
// rename a soort all the way into its address, and a hard-coded `item` would
// quietly stop matching the day `item` became `voorwerpen`.
const TAB_ORDER = (soorten: { slug: string; caseOnly: boolean }[]) => [
  'people',
  ...soorten.filter((type) => type.caseOnly).map((type) => type.slug),
  'location',
  'object',
  'abnormality',
];

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** §22: `?new=1` — a dossier made this second opens with its fields open. */
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await getSessionUser();
  const { slug } = await params;
  const query = await searchParams;

  const record = getCaseBySlug(slug, user);
  if (!record) notFound();

  // §17
  const grant = user ? grantFor('case', record.id, user.id) : null;
  const mayEdit = canEdit(record, user, grant);
  const mayManage = canManageAccess(record, user);
  const access = {
    settings:
      mayManage || record.accessLocked
        ? accessSettings(record, 'case', record.id)
        : {
            ownerId: null,
            viewMode: record.viewMode,
            editMode: record.editMode,
            locked: record.accessLocked,
            viewers: [],
            editors: [],
          },
    canManage: mayManage,
    canEdit: mayEdit,
    viewerId: user?.id ?? '',
  };

  const entries = listCaseEntries(record.id, user);
  const types = listEntryTypes();
  const boards = listBoardsForCase(record.id, user);
  // §32: the dossier's tijdlijnen, behind the same two rules as its prikborden.
  const timelines = listTimelinesForCase(record.id, user);
  const words = getWords();
  // §18: the log names characters; the account stays in the tooltip.
  const activity = attributed(listCaseActivity(record.id, user), words.keeper);

  const accounts = db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .orderBy(asc(schema.users.usernameLower))
    .all();
  const worn = charactersWorn(accounts.map((a) => a.id));
  const allUsers = accounts.map((a) => ({ ...a, character: worn.get(a.id) ?? null }));
  const members = listCaseMembers(record.id).map((m) => ({
    ...m,
    character: worn.get(m.id) ?? null,
  }));

  // §20: the working notes are shared text, handed over in the page.
  const admission = user ? admit(caseRoomKey(record.id), user) : null;
  const liveNotes =
    admission && user
      ? {
          room: admission.spec.key,
          state: snapshot(admission.spec).state,
          canEdit: admission.canEdit,
          user: {
            // §21: a caret says who is here, so a Keeper is their account name.
            name: windowPresenceName(user, words.keeper),
            colour: presenceColour(user.id),
          },
        }
      : null;

  // Build one candidate tab per §7 group, then let §30 say which of them the
  // file actually has and in what order. Everything with something filed in it
  // survives either way, so this can only ever *add* shelves.
  const peopleTypes = types.filter((t) => MERGED_PEOPLE.typeSlugs.includes(t.slug));
  const candidates: CaseGroup[] = [
    {
      key: MERGED_PEOPLE.key,
      label: MERGED_PEOPLE.label,
      icon: peopleTypes[0]?.icon ?? 'person',
      colour: peopleTypes[0]?.colour ?? 'var(--ink-muted)',
      typeSlugs: MERGED_PEOPLE.typeSlugs,
      entries: entries.filter((e) => MERGED_PEOPLE.typeSlugs.includes(e.typeSlug)),
      pinned: false,
    },
    ...types
      .filter((type) => !MERGED_PEOPLE.typeSlugs.includes(type.slug))
      .map((type) => ({
        key: type.slug,
        label: type.label,
        icon: type.icon,
        colour: type.colour,
        typeSlugs: [type.slug],
        entries: entries.filter((e) => e.typeSlug === type.slug),
        pinned: false,
      })),
  ];

  const sortOrderOf = new Map(types.map((type) => [type.slug, type.sortOrder]));
  const sources: CaseTabSource[] = candidates.map((group) => ({
    key: group.key,
    typeSlugs: group.typeSlugs,
    count: group.entries.length,
    // The merged Personen tab takes the earlier of its two soorten.
    sortOrder: Math.min(
      ...group.typeSlugs.map((slug) => sortOrderOf.get(slug) ?? Number.MAX_SAFE_INTEGER),
    ),
  }));

  const byKey = new Map(candidates.map((group) => [group.key, group]));
  const groups: CaseGroup[] = planCaseTabs(sources, record.tabTypes, TAB_ORDER(types))
    .map((tab) => {
      const group = byKey.get(tab.key)!;
      return { ...group, pinned: tab.pinned };
    });

  // Every soort, for the "Tabbladen" sheet: what it is called, what it looks
  // like, whether it is one that only exists inside a dossier (§24), and how
  // many of them are filed here — so ticking one off is never a blind choice.
  const soorten = types.map((type) => ({
    slug: type.slug,
    label: type.label,
    icon: type.icon,
    colour: type.colour,
    caseOnly: type.caseOnly,
    count: entries.filter((e) => e.typeSlug === type.slug).length,
  }));

  // §21: the name and the one-liner as shared fields.
  const fieldsAdmission = user ? admit(caseFieldsRoomKey(record.id), user) : null;
  const liveFields =
    fieldsAdmission && liveNotes
      ? { room: fieldsAdmission.spec.key, state: snapshot(fieldsAdmission.spec).state, canEdit: fieldsAdmission.canEdit, user: liveNotes.user }
      : null;

  return (
    <>
      <LivePage place={caseKey(record.id)} watch={['entries', 'boards', 'timelines', 'users']} />
      {/* §44/§45/§46: which side this dossier is on — the word, the colours,
          and the browser's side, so following a link across turns the site
          over with you. */}
      <KeeperStamp
        side={sideOf(Boolean(user?.isKeeper && keeperRef('case', record.id, user)?.keeperOnly))}
        browserSide={user?.isKeeper ? user.side : undefined}
        flipTo={twinOf('case', record.id, user)?.href ?? '/cases'}
      />
      <CaseDossier
      data={{
        id: record.id,
        slug: record.slug,
        name: record.name,
        summary: record.summary,
        status: record.status,
        notes: record.notes,
        coverAssetId: record.coverAssetId,
        coverCrop: record.coverCrop,
      }}
      groups={groups}
      soorten={soorten}
      tabTypes={record.tabTypes ?? null}
      members={members}
      allUsers={allUsers}
      boards={boards.map((b) => ({ id: b.id, name: b.name, updatedAt: b.updatedAt }))}
      timelines={timelines.map((t) => ({ id: t.id, slug: t.slug, name: t.name, updatedAt: t.updatedAt, scale: t.scale }))}
      activity={activity}
      liveNotes={liveNotes}
      lastSeenAt={user?.lastSeenAt ?? null}
      isKeeper={Boolean(user?.isKeeper)}
      access={access}
      liveFields={liveFields}
      /*
       * §22: everybody lands on the reading face here too, a Keeper included.
       * The exception is the dossier you have just made — the sheet lands you
       * on `?new=1` — which opens with everything open.
       */
      openAddMore={query.new === '1'}
      keeperSlot={
        user?.isKeeper ? <KeeperPanelServer kind="case" id={record.id} user={user} /> : null
      }
      binSlot={
        mayEdit ? (
          <details className="section" style={{ marginTop: '1.5rem' }}>
            <summary>Dossier verwijderen</summary>
            <div style={{ padding: '0.6rem 0 1.5rem' }}>
              <p className="small muted">
                Niets wordt echt gewist — een {words.keeper} kan dit terughalen uit de prullenbak.
                De {words.entryPlural} erin blijven staan.
              </p>
              <form action={deleteCaseAction}>
                <input type="hidden" name="caseId" value={record.id} />
                <button className="btn btn-small btn-danger" type="submit">
                  <Icon name="trash" size={14} />
                  Naar de prullenbak
                </button>
              </form>
            </div>
          </details>
        ) : null
      }
    />
    </>
  );
}
