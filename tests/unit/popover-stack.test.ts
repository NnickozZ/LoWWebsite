import { beforeEach, describe, expect, it } from 'vitest';
import { closePopover, openPopover, popoverIsOpen, resetPopoverStack } from '@/lib/popoverStack';

/**
 * §69: one press of Escape peels one layer.
 *
 * The pile itself is four lines; what is worth holding down is the *bookkeeping*,
 * because the failure mode is silent and nasty in both directions. A token that
 * is never handed back leaves Escape dead on every sheet for the rest of the
 * page's life; a pile that empties too eagerly puts the sheet back in front of a
 * list that is still on the screen.
 */
describe('§69 de popover-stapel', () => {
  beforeEach(() => resetPopoverStack());

  it('is leeg tot er iets opengaat', () => {
    expect(popoverIsOpen()).toBe(false);
  });

  it('houdt Escape vast zolang er één openstaat', () => {
    const token = openPopover();
    expect(popoverIsOpen()).toBe(true);
    closePopover(token);
    expect(popoverIsOpen()).toBe(false);
  });

  it('geeft Escape pas terug als de laatste weg is', () => {
    // Two at once is not a thing the app does today, but a `StrictMode` double
    // mount is — and that is exactly a second token for one list.
    const first = openPopover();
    const second = openPopover();
    closePopover(first);
    expect(popoverIsOpen()).toBe(true);
    closePopover(second);
    expect(popoverIsOpen()).toBe(false);
  });

  it('negeert een token dat al terug is, en eentje dat nooit bestond', () => {
    const token = openPopover();
    closePopover(token);
    closePopover(token);
    closePopover(9999);
    expect(popoverIsOpen()).toBe(false);
  });

  it('geeft nooit twee keer hetzelfde token uit', () => {
    const tokens = [openPopover(), openPopover(), openPopover()];
    expect(new Set(tokens).size).toBe(3);
    // …and closing by the wrong token leaves the right one standing.
    closePopover(tokens[0]);
    closePopover(tokens[0]);
    expect(popoverIsOpen()).toBe(true);
  });
});
