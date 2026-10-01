/**
 * Golf O, vijfde pas (Nick: "Als je een artikel wilt verplaatsen naar de
 * prullenbak moet je ook 'akkoord' typen, niet de titel van het artikel").
 *
 * The one comparison, pure, so the button in the browser and the action on the
 * server ask the same thing. Case and spaces do not count: this is a guard
 * against acting without thinking, not a spelling test — the same rule as the
 * name typed back before *Voorgoed wissen* (`destroyAction`).
 */
export function confirmsBin(typed: string, word: string): boolean {
  const same = (value: string) => value.replace(/\s+/g, '').toLocaleLowerCase('nl');
  const expected = same(word);
  return expected.length > 0 && same(typed) === expected;
}
