import { describe, expect, it } from 'vitest';
import {
  dedupeEdges,
  edgesFromFields,
  FIELD_ROLES,
  inverseRole,
  isFieldRole,
  refIdsIn,
  roleFieldsOf,
  ROLE_HINTS,
  ROLE_LABELS,
  type RoleFieldSource,
} from '@/lib/families/roles';
import { FRAME_LABELS, frameForType, isFrameKind } from '@/lib/families/frames';
import { FRAME_KINDS, type FieldRole } from '@/lib/families/types';

/** §66 — the pure reading of a koppelingsveld's role, and the frame a soort wears. */

const defs: RoleFieldSource[] = [
  { key: 'ouders', label: 'Ouders', kind: 'entry_links', role: 'parent', ofType: ['character'] },
  { key: 'kinderen', label: 'Kinderen', kind: 'entry_links', role: 'child', ofType: ['character'] },
  { key: 'partner', label: 'Partner', kind: 'entry_link', role: 'partner' },
  { key: 'aspect_van', label: 'Aspect van', kind: 'entry_links', role: 'kin' },
  { key: 'familie', label: 'Familie', kind: 'entry_link' },
  { key: 'achternaam', label: 'Achternaam', kind: 'text', role: 'parent' },
];

describe('§66 de vier rollen', () => {
  it('lists exactly four roles and recognises them', () => {
    expect([...FIELD_ROLES]).toEqual(['parent', 'child', 'partner', 'kin']);
    for (const role of FIELD_ROLES) expect(isFieldRole(role)).toBe(true);
    expect(isFieldRole('ouder')).toBe(false);
    expect(isFieldRole('')).toBe(false);
    expect(isFieldRole(undefined)).toBe(false);
    expect(isFieldRole({ role: 'parent' })).toBe(false);
  });

  it('names each role in Dutch and hints at what it does to the drawing', () => {
    expect(ROLE_LABELS).toEqual({
      parent: 'Ouder',
      child: 'Kind',
      partner: 'Partner',
      kin: 'Verwant',
    });
    for (const role of FIELD_ROLES) {
      expect(ROLE_HINTS[role].length).toBeGreaterThan(10);
      expect(ROLE_HINTS[role].endsWith('.')).toBe(true);
    }
  });

  it('mirrors parent↔child and partner↔partner, and never mirrors kin', () => {
    expect(inverseRole('parent')).toBe('child');
    expect(inverseRole('child')).toBe('parent');
    expect(inverseRole('partner')).toBe('partner');
    expect(inverseRole('kin')).toBeNull();
    // Mirroring twice is the identity, which is what stops the server looping.
    for (const role of FIELD_ROLES) {
      const back = inverseRole(role);
      if (back) expect(inverseRole(back)).toBe(role);
    }
  });
});

describe('§66 reading a koppelingsveld', () => {
  it('reads all four shapes a ref has ever been written in', () => {
    expect(refIdsIn('e1')).toEqual(['e1']);
    expect(refIdsIn({ id: 'e1' })).toEqual(['e1']);
    expect(refIdsIn(['e1', 'e2'])).toEqual(['e1', 'e2']);
    expect(refIdsIn([{ id: 'e1' }, { id: 'e2' }])).toEqual(['e1', 'e2']);
    expect(refIdsIn(['e1', { id: 'e2' }])).toEqual(['e1', 'e2']);
    expect(refIdsIn(null)).toEqual([]);
    expect(refIdsIn('')).toEqual([]);
    expect(refIdsIn([null, 3, { name: 'x' }])).toEqual([]);
  });

  /*
   * `refIdsIn` is a deliberate copy of `entryIdsIn` in `lib/entries/mentions.ts`,
   * because that file opens the database at module load and everything below
   * `lib/families/graph.ts` must be importable from a client component. This
   * case walks the awkward shapes both readings have to agree on; the twin lives
   * in `entry-mentions.test.ts`, which can afford a real archive.
   */
  it('drops the empty and the malformed rather than yielding a blank id', () => {
    expect(refIdsIn([{ id: '' }, 'ok'])).toEqual(['ok']);
    expect(refIdsIn(42)).toEqual([]);
    expect(refIdsIn(undefined)).toEqual([]);
    expect(refIdsIn({ name: 'Jan' })).toEqual([]);
  });

  it('keeps only koppelingsvelden that carry a valid role', () => {
    expect(roleFieldsOf(defs)).toEqual([
      { key: 'ouders', label: 'Ouders', role: 'parent', ofType: ['character'] },
      { key: 'kinderen', label: 'Kinderen', role: 'child', ofType: ['character'] },
      { key: 'partner', label: 'Partner', role: 'partner' },
      { key: 'aspect_van', label: 'Aspect van', role: 'kin' },
    ]);
  });

  it('falls back to the role word when a field has no label of its own', () => {
    expect(roleFieldsOf([{ key: 'x', label: '', kind: 'entry_links', role: 'kin' }])).toEqual([
      { key: 'x', label: 'Verwant', role: 'kin' },
    ]);
  });

  it('survives rubbish among the field definitions', () => {
    const rubbish = [
      null,
      undefined,
      { key: '', label: 'x', kind: 'entry_link', role: 'parent' },
      { key: 'ok', label: 'Ok', kind: 'entry_link', role: 'parent', ofType: [1, '', 'character'] },
    ] as unknown as RoleFieldSource[];
    expect(roleFieldsOf(rubbish)).toEqual([
      { key: 'ok', label: 'Ok', role: 'parent', ofType: ['character'] },
    ]);
    expect(roleFieldsOf([])).toEqual([]);
  });
});

describe('§66 fields become lines', () => {
  it('turns a parent field on A holding B into B → A', () => {
    const edges = edgesFromFields('A', defs, { ouders: [{ id: 'B' }] });
    expect(edges).toEqual([
      { from: 'B', to: 'A', role: 'parent', label: 'Ouders', fieldKey: 'ouders', targetId: 'B' },
    ]);
  });

  it('turns a child field on A holding B into A → B — the same line, said the other way', () => {
    const edges = edgesFromFields('A', defs, { kinderen: ['B'] });
    expect(edges).toEqual([
      { from: 'A', to: 'B', role: 'parent', label: 'Kinderen', fieldKey: 'kinderen', targetId: 'B' },
    ]);
  });

  it('leaves partner and kin as stored, from the artikel that said it', () => {
    expect(edgesFromFields('A', defs, { partner: { id: 'B' }, aspect_van: 'C' })).toEqual([
      { from: 'A', to: 'B', role: 'partner', label: 'Partner', fieldKey: 'partner', targetId: 'B' },
      { from: 'A', to: 'C', role: 'kin', label: 'Aspect van', fieldKey: 'aspect_van', targetId: 'C' },
    ]);
  });

  it('draws nothing from a field that is not a role field, and nothing to itself', () => {
    expect(edgesFromFields('A', defs, { familie: 'H', achternaam: 'B' })).toEqual([]);
    expect(edgesFromFields('A', defs, { ouders: ['A'] })).toEqual([]);
    expect(edgesFromFields('', defs, { ouders: ['B'] })).toEqual([]);
    expect(edgesFromFields('A', defs, {})).toEqual([]);
  });

  it('draws one line for the same id twice in one field', () => {
    expect(edgesFromFields('A', defs, { ouders: ['B', 'B'] })).toHaveLength(1);
  });

  it('reads every role field of the soort, in the soort’s own order', () => {
    const edges = edgesFromFields('A', defs, {
      ouders: ['P1', 'P2'],
      kinderen: ['K'],
      partner: 'S',
    });
    expect(edges.map((edge) => `${edge.from}>${edge.to}:${edge.role}`)).toEqual([
      'P1>A:parent',
      'P2>A:parent',
      'A>K:parent',
      'A>S:partner',
    ]);
  });
});

describe('§66 the mirrored halves of one line collapse', () => {
  const both = [
    ...edgesFromFields('A', defs, { kinderen: ['B'], partner: 'S' }),
    ...edgesFromFields('B', defs, { ouders: ['A'] }),
    ...edgesFromFields('S', defs, { partner: 'A' }),
  ];

  it('keeps one parent line and one partner line', () => {
    const kept = dedupeEdges(both);
    expect(kept).toHaveLength(2);
    expect(kept.map((edge) => edge.role)).toEqual(['parent', 'partner']);
    // The first reading wins, so the label and the field the canvas would PATCH
    // are the ones of the artikel the walk reached first.
    expect(kept[0]).toMatchObject({ from: 'A', to: 'B', label: 'Kinderen', fieldKey: 'kinderen' });
    expect(kept[1]).toMatchObject({ from: 'A', to: 'S', fieldKey: 'partner' });
  });

  it('sorts the ends of a partner line before comparing, and does not for a parent line', () => {
    const partners = dedupeEdges([
      { from: 'B', to: 'A', role: 'partner' as FieldRole },
      { from: 'A', to: 'B', role: 'partner' as FieldRole },
    ]);
    expect(partners).toHaveLength(1);
    // Two people who each claim to be the other's parent is a cycle, not a
    // duplicate: both lines survive, and the layout breaks the loop.
    const parents = dedupeEdges([
      { from: 'A', to: 'B', role: 'parent' as FieldRole },
      { from: 'B', to: 'A', role: 'parent' as FieldRole },
    ]);
    expect(parents).toHaveLength(2);
  });

  it('does not mirror kin, so both directions are kept', () => {
    const kin = dedupeEdges([
      { from: 'A', to: 'B', role: 'kin' as FieldRole },
      { from: 'B', to: 'A', role: 'kin' as FieldRole },
      { from: 'A', to: 'B', role: 'kin' as FieldRole },
    ]);
    expect(kin).toHaveLength(2);
  });

  it('leaves an empty list alone', () => {
    expect(dedupeEdges([])).toEqual([]);
  });
});

describe('§66 the frame a soort wears', () => {
  it('gives the four pantheon soorten a divine frame', () => {
    for (const slug of [
      'kosmische-goden',
      'aardse-goden',
      'eldritch-entiteiten',
      'bovennatuurlijke-wezens',
    ]) {
      expect(frameForType(slug)).toBe('divine');
    }
  });

  it('gives people an index card, a Familie a banner and an abnormaliteit a torn frame', () => {
    expect(frameForType('character')).toBe('mortal');
    expect(frameForType('investigator')).toBe('mortal');
    expect(frameForType('family')).toBe('house');
    expect(frameForType('abnormality')).toBe('creature');
  });

  it('gives anything unrecognised a sterveling’s card, never unknown', () => {
    for (const slug of ['location', 'item', '', 'iets-nieuws']) {
      expect(frameForType(slug)).toBe('mortal');
    }
    // `unknown` is reserved for a los kaartje, which has no soort at all.
    expect(frameForType('unknown')).toBe('mortal');
  });

  it('names all five frames in Dutch', () => {
    expect(FRAME_LABELS).toEqual({
      mortal: 'Sterveling',
      divine: 'Godheid',
      house: 'Huis',
      creature: 'Wezen',
      unknown: 'Onbekend',
    });
    for (const kind of FRAME_KINDS) expect(isFrameKind(kind)).toBe(true);
    expect(isFrameKind('sterveling')).toBe(false);
    expect(isFrameKind(null)).toBe(false);
  });
});
