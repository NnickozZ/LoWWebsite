import { slugify } from '@/lib/slug';
import type { FieldDef, FieldKind } from '@/lib/db/schema';
import type { FieldRole } from '@/lib/families/types';

/**
 * §66/§67: the five kinship roles, checked here rather than imported from
 * `lib/families/roles.ts` on purpose — this module is what a client component
 * imports to render the type editor, and it must stay as small as it is. The
 * list is five strings and it is the same five; `lib/families/roles.ts` is
 * where the *meaning* lives (`inverseRole`, the Dutch labels, the edges).
 * `sibling` joined in round 33 and `FIELD_ROLES` there must say the same.
 */
const FIELD_ROLE_KEYS = ['parent', 'child', 'partner', 'sibling', 'kin'] as const;

export function isFieldRole(value: unknown): value is FieldRole {
  return typeof value === 'string' && (FIELD_ROLE_KEYS as readonly string[]).includes(value);
}

/**
 * The field kinds a Keeper can choose in the type editor, with their Dutch
 * names. Kept out of `lib/admin/types.ts` on purpose: that module opens the
 * database, and the editor is a client component.
 */
export const FIELD_KINDS: { kind: FieldKind; label: string }[] = [
  { kind: 'text', label: 'Tekst' },
  { kind: 'longtext', label: 'Lange tekst' },
  { kind: 'number', label: 'Getal' },
  { kind: 'boolean', label: 'Ja/nee' },
  { kind: 'select', label: 'Keuzelijst' },
  { kind: 'multiselect', label: 'Meerkeuze' },
  { kind: 'entry_link', label: 'Koppeling naar één artikel' },
  { kind: 'entry_links', label: 'Koppelingen naar artikelen' },
  { kind: 'user_link', label: 'Koppeling naar een speler' },
  { kind: 'case_link', label: 'Koppeling naar één dossier' },
  { kind: 'case_links', label: 'Koppelingen naar dossiers' },
  // §66 (round 32): "Stambomen moeten gelinkt kunnen worden aan families." One
  // tree, never a list — a familie has one stamboom or none. It carries no
  // `ofType` and no `role`: a stamboom is not an artikel, so there is no soort
  // to aim it at and no kinship for it to mean.
  { kind: 'family_tree_link', label: 'Koppeling naar een stamboom' },
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
    // §38: a Meerkeuze is a Keuzelijst that takes more than one answer, so it
    // is configured the same way and kept the same way — a list with no options
    // yet stays the kind it is and takes nothing but the empty answer, exactly
    // as an option-less Keuzelijst always has.
    if (kind === 'select' || kind === 'multiselect') {
      def.options = Array.isArray(field.options)
        ? field.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 30)
        : [];
    }
    if ((kind === 'entry_link' || kind === 'entry_links') && Array.isArray(field.ofType)) {
      def.ofType = field.ofType.map((slug) => String(slug)).filter(Boolean);
    }
    // §66: a role only means something on a koppelingsveld. Retyping a field to
    // anything else drops it, so a Getal can never end up mirroring a stamboom.
    if ((kind === 'entry_link' || kind === 'entry_links') && isFieldRole(field.role)) {
      def.role = field.role;
    }
    out.push(def);
  }
  return out;
}

