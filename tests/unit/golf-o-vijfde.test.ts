import { describe, expect, it } from 'vitest';
import { confirmsBin } from '@/lib/entries/binConfirm';
import { DEFAULT_WORDS } from '@/lib/words';

describe('golf O, vijfde pas: akkoord voor de prullenbak', () => {
  it('vraagt het woord, niet de naam', () => {
    expect(DEFAULT_WORDS.deleteConfirmWord).toBe('akkoord');
    expect(confirmsBin('akkoord', 'akkoord')).toBe(true);
    expect(confirmsBin(' Akkoord ', 'akkoord')).toBe(true);
    expect(confirmsBin('AKKOORD', 'akkoord')).toBe(true);
    expect(confirmsBin('akkoor', 'akkoord')).toBe(false);
    expect(confirmsBin('', 'akkoord')).toBe(false);
    expect(confirmsBin('De vuurtoren', 'akkoord')).toBe(false);
  });
  it('een leeg woord van de Keeper laat nooit iets door', () => {
    expect(confirmsBin('', '')).toBe(false);
    expect(confirmsBin('  ', ' ')).toBe(false);
  });
});
