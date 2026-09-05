import { slugify } from '@/lib/slug';
import type { FieldDef, FieldKind } from '@/lib/db/schema';

/**
 * The field kinds a Keeper can choose in the type editor, with their Dutch
 * names. Kept out of `lib/admin/types.ts` on purpose: that module opens the
 * database, and the editor is a client component.
 */
export const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Tekst' },
  { kind: 'longtext', label: 'Lange tekst' },
  { kind: 'select', label: 'Keuzelijst' },
  { kind: 'entry_link', label: 'Koppeling naar één fiche' },
  { kind: 'entry_links', label: 'Koppelingen naar fiches' },
  { kind: 'user_link', label: 'Koppeling naar een speler' },
  { kind: 'case_link', label: 'Koppeling naar een dossier' },
  { kind: 'date', label: 'Datum' },
  { kind: 'map_pin', label: 'Speld op de landkaart (verwijst naar de kaartenpagina)' },
];

const KNOWN_KINDS = new Set(FIELD_KINDS.map((entry) => entry.kind));

/** Keeps a field list to shapes the editors can actually render. */
export function cleanFields(input: unknown): FieldDef[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== 'object') continue;
    const field = raw as Partial<FieldDef>;
    const label = typeof field.label === 'string' ? field.label.trim().slice(0, 60) : '';
    if (!label) continue;
    const key = (typeof field.key === 'string' && field.key ? field.key : slugify(label)).replace(
      /-/g,
      '_',
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const kind = KNOWN_KINDS.has(field.kind as FieldKind) ? (field.kind as FieldKind) : 'text';
    const def: FieldDef = { key, label, kind };
    if (kind === 'select') {
      def.options = Array.isArray(field.options)
        ? field.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 30)
        : [];
    }
    if ((kind === 'entry_link' || kind === 'entry_links') && Array.isArray(field.ofType)) {
      def.ofType = field.ofType.map((slug) => String(slug)).filter(Boolean);
    }
    out.push(def);
  }
  return out;
}

