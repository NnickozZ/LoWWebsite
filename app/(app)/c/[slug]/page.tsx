import { notFound } from 'next/navigation';
import { asc } from 'drizzle-orm';
import { CaseDossier, type CaseGroup } from '@/components/cases/CaseDossier';
import { getSessionUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
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

  const entries = listCaseEntries(record.id, user);
  const types = listEntryTypes();
  const members = listCaseMembers(record.id);
  const boards = listBoardsForCase(record.id);
  const activity = listCaseActivity(record.id, user);

  const allUsers = db
    .select({ id: schema.users.id, username: schema.users.username })
    .from(schema.users)
    .orderBy(asc(schema.users.usernameLower))
    .all();

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
        visibility: record.visibility,
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
      lastSeenAt={user?.lastSeenAt ?? null}
      isKeeper={Boolean(user?.isKeeper)}
    />
  );
}
