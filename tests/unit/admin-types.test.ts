import { describe, expect, it } from 'vitest';
import { cleanFields } from '@/lib/fieldKinds';
import { allowedFieldKeys, listBlockKeys, orphanValueCounts } from '@/lib/entries/fieldValues';
import { resolveBlocks } from '@/lib/pageBlocks';

/**
 * §11 lets a Keeper type field definitions by hand. Whatever comes back has to
 * be something `FieldsEditor` can render, or an entry page breaks for everyone.
 */
describe('cleanFields', () => {
  it('keeps a well-formed field', () => {
    expect(cleanFields([{ key: 'beroep', label: 'Beroep', kind: 'text' }])).toEqual([
      { key: 'beroep', label: 'Beroep', kind: 'text' },
    ]);
  });

  it('makes a key from the label when one is missing', () => {
    const [field] = cleanFields([{ label: 'Laatst gezien bij', kind: 'text' }]);
    expect(field.key).toBe('laatst_gezien_bij');
  });

  it('drops a field with no label, because nothing could render it', () => {
    expect(cleanFields([{ key: 'x', label: '   ', kind: 'text' }])).toEqual([]);
  });

  it('falls back to text for a kind it does not ship', () => {
    const [field] = cleanFields([{ label: 'Iets', kind: 'quantum' }]);
    expect(field.kind).toBe('text');
  });

  it('refuses a duplicate key, which would collide in the entry JSON', () => {
    const fields = cleanFields([
      { key: 'status', label: 'Status', kind: 'text' },
      { key: 'status', label: 'Ook status', kind: 'text' },
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].label).toBe('Status');
  });

  it('gives a select its options and trims them', () => {
    const [field] = cleanFields([
      { label: 'Status', kind: 'select', options: [' levend ', 'dood', ''] },
    ]);
    expect(field.options).toEqual(['levend', 'dood']);
  });

  /**
   * §38: a Meerkeuze is a Keuzelijst that takes more than one answer, so it is
   * configured with the same box and cleaned by the same rule — including the
   * option-less case, where both keep the kind the Keeper chose and take
   * nothing but the empty answer until the options are typed.
   */
  it('gives a multiselect its options too, and trims them the same way', () => {
    const [field] = cleanFields([
      { label: 'Lading', kind: 'multiselect', options: [' zout ', 'graan', '  '] },
    ]);
    expect(field.kind).toBe('multiselect');
    expect(field.options).toEqual(['zout', 'graan']);
  });

  it('keeps a multiselect with no options at all, exactly as a select is kept', () => {
    const [empty] = cleanFields([{ label: 'Lading', kind: 'multiselect' }]);
    const [selectEmpty] = cleanFields([{ label: 'Status', kind: 'select' }]);
    expect(empty).toEqual({ key: 'lading', label: 'Lading', kind: 'multiselect', options: [] });
    expect(selectEmpty.options).toEqual([]);
    expect(empty.kind).toBe('multiselect');
  });

  it('keeps a Getal and a Ja/nee, which carry no configuration of their own', () => {
    expect(
      cleanFields([
        { label: 'Tonnage', kind: 'number', options: ['x'] },
        { label: 'Vermist', kind: 'boolean' },
      ]),
    ).toEqual([
      { key: 'tonnage', label: 'Tonnage', kind: 'number' },
      { key: 'vermist', label: 'Vermist', kind: 'boolean' },
    ]);
  });

  it('survives rubbish', () => {
    expect(cleanFields(null)).toEqual([]);
    expect(cleanFields('nope')).toEqual([]);
    expect(cleanFields([null, 7, 'x'])).toEqual([]);
  });

  it('caps a runaway list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Veld ${i}`, kind: 'text' }));
    expect(cleanFields(many)).toHaveLength(20);
  });
});

/**
 * §38: "Oude waarden" in the type editor.
 *
 * Taking a field away has never destroyed what was filed under it — putting the
 * field back brings the values with it, which is the promise the editor makes
 * in Dutch at the top of the screen. That is right, and it is also invisible:
 * a Keeper who renamed a field twice has no way of knowing the archive is still
 * carrying the first two. `listTypesForAdmin` counts them with this, per key,
 * and prints the count beside the one button that actually deletes.
 *
 * The count is measured against the *same* two sources the gate uses, or every
 * hand-filled list on the page would be reported as an orphan of itself.
 */
describe('the orphan count behind “Oude waarden”', () => {
  const fields = cleanFields([
    { key: 'occupation', label: 'Beroep', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'select', options: ['levend', 'dood'] },
  ]);
  // Straight out of the Keeper's saved page: a hand-filled list has a key of
  // its own and no field definition anywhere.
  const blocks = resolveBlocks([
    { id: 'fields', kind: 'fields' },
    { id: 'blk_1', kind: 'links', title: 'Bondgenoten' },
    { id: 'body', kind: 'body' },
  ]);
  const allowed = () => allowedFieldKeys(fields, listBlockKeys(blocks));

  it('counts each abandoned key once per artikel that still has a value under it', () => {
    expect(
      orphanValueCounts(allowed(), [
        { occupation: 'visser', beroep: 'visser' },
        { beroep: 'smid', leeftijd: 40 },
        { beroep: 'wever' },
      ]),
    ).toEqual([
      { key: 'beroep', count: 3 },
      { key: 'leeftijd', count: 1 },
    ]);
  });

  it('never reports a hand-filled list as an orphan of itself', () => {
    const key = blocks.find((block) => block.kind === 'links')!.key!;
    expect(key).toBe('lijst_bondgenoten');
    expect(orphanValueCounts(allowed(), [{ [key]: [{ id: 'e1', name: 'A', slug: 'a' }] }])).toEqual(
      [],
    );
    // …and would, loudly, if the second source were left out.
    expect(
      orphanValueCounts(allowedFieldKeys(fields, []), [{ [key]: [{ id: 'e1', name: 'A', slug: 'a' }] }]),
    ).toEqual([{ key, count: 1 }]);
  });

  it('does not count an empty leftover, because there is nothing there to lose', () => {
    expect(
      orphanValueCounts(allowed(), [
        { beroep: '' },
        { beroep: null },
        { oude_lijst: [] },
        { oude_lijst: [{ id: 'e1' }] },
      ]),
    ).toEqual([{ key: 'oude_lijst', count: 1 }]);
  });

  it('says nothing at all about a soort nobody has rearranged', () => {
    expect(orphanValueCounts(allowed(), [{ occupation: 'visser', status: 'dood' }, {}])).toEqual([]);
  });
});
