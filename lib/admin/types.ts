import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logAudit } from '@/lib/entries/service';
import { slugify } from '@/lib/slug';
import { cleanFields } from '@/lib/fieldKinds';
import { cleanBlocks, cleanTypeText, resolveBlocks, type PageBlock, type TypeText } from '@/lib/pageBlocks';
import type { FieldDef } from '@/lib/db/schema';

/**
 * §11's entry-type editor. The seed writes these rows on first start; from the
 * moment a Keeper can edit them, the seed must stop overwriting the words (see
 * `seedBaseline`), or every restart would undo their work.
 */

export type TypeRow = {
  id: string;
  slug: string;
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: FieldDef[];
  /** §11: what this soort's page is made of, already resolved for the editor. */
  blocks: PageBlock[];
  /** This soort's own wording for the few shared sentences that read badly. */
  pageText: TypeText;
  sortOrder: number;
  /** How many entries are filed under it — a type in use should not vanish quietly. */
  entryCount: number;
};

export function listTypesForAdmin(): TypeRow[] {
  const types = db
    .select()
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all();
  const counts = new Map<string, number>();
  for (const row of db.select({ typeId: schema.entries.typeId }).from(schema.entries).all()) {
    counts.set(row.typeId, (counts.get(row.typeId) ?? 0) + 1);
  }
  return types.map((type) => ({
    id: type.id,
    slug: type.slug,
    label: type.label,
    icon: type.icon,
    colour: type.colour,
    border: type.border,
    fields: type.fields ?? [],
    blocks: resolveBlocks(type.blocks),
    pageText: cleanTypeText(type.pageText),
    sortOrder: type.sortOrder,
    entryCount: counts.get(type.id) ?? 0,
  }));
}

export type TypePatch = Partial<{
  label: string;
  icon: string;
  colour: string;
  border: string;
  fields: unknown;
  blocks: unknown;
  pageText: unknown;
  sortOrder: number;
}>;

export function updateType(typeId: string, patch: TypePatch, keeperId: string) {
  const existing = db
    .select()
    .from(schema.entryTypes)
    .where(eq(schema.entryTypes.id, typeId))
    .get();
  if (!existing) throw new Error('Soort artikel niet gevonden');

  const values: Record<string, unknown> = {};
  if (patch.label !== undefined && patch.label.trim()) values.label = patch.label.trim().slice(0, 60);
  if (patch.icon !== undefined && patch.icon.trim()) values.icon = patch.icon.trim();
  if (patch.colour !== undefined && /^#[0-9a-fA-F]{6}$/.test(patch.colour)) {
    values.colour = patch.colour;
  }
  if (patch.border !== undefined) values.border = patch.border;
  if (patch.fields !== undefined) values.fields = cleanFields(patch.fields);
  // §11: `cleanBlocks` is what guarantees the five built-ins are all still
  // there, so a saved page can never be one without a body to type in.
  if (patch.blocks !== undefined) values.blocks = cleanBlocks(patch.blocks);
  if (patch.pageText !== undefined) values.pageText = cleanTypeText(patch.pageText);
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (!Object.keys(values).length) return;

  db.update(schema.entryTypes).set(values).where(eq(schema.entryTypes.id, typeId)).run();
  logAudit({
    actorId: keeperId,
    action: 'entry_type.edited',
    targetType: 'entry_type',
    targetId: typeId,
    meta: { slug: existing.slug, keys: Object.keys(values) },
  });
}

export function createType(
  input: { label: string; icon?: string; colour?: string; border?: string },
  keeperId: string,
): string {
  const label = input.label.trim().slice(0, 60);
  if (!label) throw new Error('Geef de soort eerst een naam.');

  const base = slugify(label) || 'soort';
  const taken = new Set(
    db
      .select({ slug: schema.entryTypes.slug })
      .from(schema.entryTypes)
      .all()
      .map((row) => row.slug),
  );
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const last = db
    .select({ sortOrder: schema.entryTypes.sortOrder })
    .from(schema.entryTypes)
    .orderBy(asc(schema.entryTypes.sortOrder))
    .all()
    .at(-1);

  db.insert(schema.entryTypes)
    .values({
      id: slug,
      slug,
      label,
      icon: input.icon?.trim() || 'file',
      colour: /^#[0-9a-fA-F]{6}$/.test(input.colour ?? '') ? input.colour! : '#5C544A',
      border: input.border || 'plain',
      fields: [],
      blocks: [],
      pageText: {},
      sortOrder: (last?.sortOrder ?? 0) + 10,
    })
    .run();

  logAudit({
    actorId: keeperId,
    action: 'entry_type.created',
    targetType: 'entry_type',
    targetId: slug,
    meta: { label },
  });
  return slug;
}

/**
 * A type with entries filed under it cannot be removed — the entries would have
 * nothing to be. §16 says fewer options, so there is no "move them all" flow:
 * refile them first, and the button says so.
 */
export function deleteType(typeId: string, keeperId: string) {
  const inUse = db.select().from(schema.entries).where(eq(schema.entries.typeId, typeId)).all();
  if (inUse.length) throw new Error('Er staan nog artikelen onder deze soort.');
  db.delete(schema.entryTypes).where(eq(schema.entryTypes.id, typeId)).run();
  logAudit({
    actorId: keeperId,
    action: 'entry_type.deleted',
    targetType: 'entry_type',
    targetId: typeId,
  });
}
