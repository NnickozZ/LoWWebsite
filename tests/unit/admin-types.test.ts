import { describe, expect, it } from 'vitest';
import { cleanFields } from '@/lib/fieldKinds';

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
