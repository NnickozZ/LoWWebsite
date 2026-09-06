import { describe, expect, it } from 'vitest';
import { mergePatch } from '@/components/entry/useAutosave';

/** What every patch in this file is: a bag of whatever the page changed. */
type Bag = Record<string, unknown>;

/**
 * §6 with §38: what is waiting to be saved, when a second change arrives
 * before the 800 ms is up.
 *
 * The infobox broke this rule the moment it grew more than one kind of box.
 * Filling in a Getal and then ticking a Ja/nee inside one window sends
 * `{ fields: { tonnage } }` and then `{ fields: { vermist } }`, and a plain
 * `{ ...waiting, ...arriving }` replaces the whole bag: the Getal was thrown
 * away before it was ever sent, and the one PATCH that went out carried only
 * the last box anybody touched. The page still *looked* right, because the
 * editing face reads its own state — the loss only showed on somebody else's
 * screen, which is the worst way for it to show.
 *
 * So a key named in `mergeKeys` is merged a level deeper. Every other key
 * still replaces: a name, a body or a cover is one value, and the second
 * answer to it is the answer.
 */
describe('mergePatch', () => {
  it('replaces a plain value: the last answer wins', () => {
    expect(mergePatch<Bag>({ name: 'Eerste' }, { name: 'Tweede' })).toEqual({ name: 'Tweede' });
  });

  it('keeps the keys that were not touched again', () => {
    expect(mergePatch<Bag>({ name: 'Eerste' }, { shortDescription: 'kort' })).toEqual({
      name: 'Eerste',
      shortDescription: 'kort',
    });
  });

  it('replaces a bag as well, unless it is named as one', () => {
    const waiting: Bag = { fields: { tonnage: 1400 } };
    const arriving: Bag = { fields: { vermist: true } };
    expect(mergePatch(waiting, arriving)).toEqual({ fields: { vermist: true } });
    expect(mergePatch(waiting, arriving, ['fields'])).toEqual({
      fields: { tonnage: 1400, vermist: true },
    });
  });

  it('merges three boxes of one infobox, and the newer answer to one box wins', () => {
    const one = mergePatch<Bag>({}, { fields: { tonnage: 1400 } }, ['fields']);
    const two = mergePatch(one, { fields: { vermist: true } }, ['fields']);
    const three = mergePatch(two, { fields: { lading: ['zout', 'kolen'] } }, ['fields']);
    const again = mergePatch(three, { fields: { tonnage: 1500 } }, ['fields']);
    expect(again).toEqual({
      fields: { tonnage: 1500, vermist: true, lading: ['zout', 'kolen'] },
    });
  });

  it('replaces a list inside a bag rather than growing it', () => {
    // An array is a value, not a bag: a Meerkeuze's answers replace, they do
    // not accumulate, or unticking one would never reach the server.
    const waiting: Bag = { fields: { lading: ['zout', 'kolen'] } };
    const arriving: Bag = { fields: { lading: ['zout'] } };
    expect(mergePatch(waiting, arriving, ['fields'])).toEqual({ fields: { lading: ['zout'] } });
  });

  it('does not merge when one side is not a bag', () => {
    expect(mergePatch<Bag>({ fields: null }, { fields: { tonnage: 1400 } }, ['fields'])).toEqual({
      fields: { tonnage: 1400 },
    });
    expect(mergePatch<Bag>({ fields: { tonnage: 1400 } }, { fields: null }, ['fields'])).toEqual({
      fields: null,
    });
  });

  it('does not reach into the patch it was given', () => {
    const waiting: Bag = { fields: { tonnage: 1400 } };
    mergePatch(waiting, { fields: { vermist: true } }, ['fields']);
    expect(waiting).toEqual({ fields: { tonnage: 1400 } });
  });
});
