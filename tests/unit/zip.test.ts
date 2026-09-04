import { describe, expect, it } from 'vitest';
import { createZip, readZip } from '@/lib/zip.mjs';

describe('backup zip', () => {
  it('round-trips text and binary entries', () => {
    const files = [
      { name: 'json/entries.json', data: Buffer.from(JSON.stringify([{ id: 'a', name: 'Café' }])) },
      { name: 'assets/x.webp', data: Buffer.from([0, 1, 2, 250, 255, 128, 0, 0]) },
      { name: 'MANIFEST.json', data: Buffer.from('{"format":1}') },
    ];

    const restored = readZip(createZip(files));
    expect(restored.size).toBe(3);
    expect(restored.get('MANIFEST.json')!.toString('utf8')).toBe('{"format":1}');
    expect(JSON.parse(restored.get('json/entries.json')!.toString('utf8'))[0].name).toBe('Café');
    expect([...restored.get('assets/x.webp')!]).toEqual([0, 1, 2, 250, 255, 128, 0, 0]);
  });

  it('handles an empty file and a large one', () => {
    const big = Buffer.alloc(300_000, 7);
    const restored = readZip(
      createZip([
        { name: 'empty.txt', data: Buffer.alloc(0) },
        { name: 'big.bin', data: big },
      ]),
    );
    expect(restored.get('empty.txt')!.length).toBe(0);
    expect(restored.get('big.bin')!.equals(big)).toBe(true);
  });

  it('rejects something that is not a zip', () => {
    expect(() => readZip(Buffer.from('not a zip file at all'))).toThrow();
  });
});
