import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { CaseDossier, type CaseGroup } from '@/components/cases/CaseDossier';
import { accessSettings, canEdit, canManageAccess, grantFor } from '@/lib/access';
import { getWords } from '@/lib/admin/words';
import { getSessionUser } from '@/lib/auth/session';
import { presenceColour } from '@/lib/boards/live';
import { attributed, charactersWorn, displayNames } from '@/lib/characters';
import { db, schema } from '@/lib/db';
import { snapshot } from '@/lib/live/docs';
import { admit, caseRoomKey } from '@/lib/live/rooms';
import { listBoardsForCase } from '@/lib/boards/service';
import {
  getCaseBySlug,
  listCaseActivity,
  listCaseEntries,
  listCaseMembers,
} from '@/lib/cases/service';
import { listEntryTypes } from '@/lib/entries/service';

export const dynamic = 'force-dynamic';

/** §7's tab list. Anything else keeps its own tab so nothing filed here is lost. */
const MERGED_PEOPLE = { key: 'people', label: 'Personen', typeSlugs: ['character', 'investigator'] };
const TAB_ORDER = ['people', 'location', 'object', 'clue', 'abnormality'];

export default async function CasePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  const { slug } = await params;

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
            name: displayNames([{ id: user.id, username: user.username, isKeeper: user.isKeeper }], words.keeper).get(user.id)?.label ?? user.username,
            colour: presenceColour(user.id),
          },
        }
      : null;

  // Build one group per §7 tab, then one for any other type that has entries.
  const groups: CaseGroup[] = [];

  const peopleTypes = types.filter((t) => MERGED_PEOPLE.typeSlugs.includes(t.slug));
  groups.push({
    key: MERGED_PEOPLE.key,
    label: MERGED_PEOPLE.label,
    icon: peopleTypes[0]?.icon ?? 'person',
    colour: peopleTypes[0]?.colour ?? 'var(--ink-muted)',
    typeSlugs: MERGED_PEOPLE.typeSlugs,
    entries: entries.filter((e) => MERGED_PEOPLE.typeSlugs.includes(e.typeSlug)),
  });

  for (const type of types) {
    if (MERGED_PEOPLE.typeSlugs.includes(type.slug)) continue;
    groups.push({
      key: type.slug,
      label: type.label,
      icon: type.icon,
      colour: type.colour,
      typeSlugs: [type.slug],
      entries: entries.filter((e) => e.typeSlug === type.slug),
    });
  }

  groups.sort((a, b) => {
    const ai = TAB_ORDER.indexOf(a.key);
    const bi = TAB_ORDER.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <CaseDossier
      data={{
        id: record.id,
        slug: record.slug,
        name: record.name,
        summary: record.summary,
        status: record.status,
        notes: record.notes,
        keeperNotes: record.keeperNotes ?? '',
        coverAssetId: record.coverAssetId,
        coverCrop: record.coverCrop,
      }}
      groups={groups}
      members={members}
      allUsers={allUsers}
      boards={boards.map((b) => ({ id: b.id, name: b.name, updatedAt: b.updatedAt }))}
      activity={activity}
      liveNotes={liveNotes}
      lastSeenAt={user?.lastSeenAt ?? null}
      isKeeper={Boolean(user?.isKeeper)}
      access={access}
    />
  );
}
