import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { textDelta } from '@/lib/live/textDelta';

/**
 * §21: the handover from a plain input to a shared one.
 *
 * A `LiveField` is a plain controlled input until the room has loaded — the
 * room is client-only, so there is always a moment after the page appears when
 * it is not there yet. Somebody typing in that moment is typing into the
 * parent's autosave, and when the room arrives the two disagree.
 *
 * Who is right depends on *why* they disagree, and this is the rule
 * `BoundField` follows. The logic is reproduced here against real Y.Texts
 * because it is three lines of condition that decide whether a person's
 * sentence survives, and it went wrong silently for weeks: a one-liner typed a
 * second after the page loaded simply vanished, and looked like a save that
 * never happened.
 */

/** Exactly the branch in `BoundField`'s observer effect, on its first pass. */
function handover(options: {
  /** What the parent holds — the page's text plus anything typed since. */
  local: string;
  /** What the room says, once it has loaded. */
  room: string;
  canEdit: boolean;
  /** False for a later pass: only the handover itself may seed the room. */
  first?: boolean;
  /** What the bound input is showing. Defaults to the room, as at first bind. */
  shown?: string;
}): { text: string; toldParent: string | null } {
  const doc = new Y.Doc();
  const text = doc.getText('f');
  if (options.room) text.insert(0, options.room);

  let toldParent: string | null = null;
  const now = text.toString();
  const shown = options.shown ?? options.room;

  if ((options.first ?? true) && options.canEdit && !now && options.local) {
    const delta = textDelta('', options.local);
    if (delta?.insert) doc.transact(() => text.insert(delta.at, delta.insert), 'local');
  } else if (now !== shown) {
    toldParent = now;
  }

  return { text: text.toString(), toldParent };
}

describe('when the room arrives and the two disagree', () => {
  it('keeps what was typed while the room was loading', () => {
    // The page shipped an empty one-liner; the person typed one; the room, which
    // has heard from nobody, still says empty. The sentence is theirs.
    const result = handover({ local: 'Een lage bakstenen toren op de dijk.', room: '', canEdit: true });
    expect(result.text).toBe('Een lage bakstenen toren op de dijk.');
    expect(result.toldParent).toBeNull();
  });

  it('but never overwrites a room somebody is already typing in', () => {
    // The room holds something, so somebody is in it and they are right. A page
    // that has been open for a while must not push its own copy over theirs.
    const result = handover({
      local: 'Een toren op de dijk',
      room: 'Een lage toren aan zee',
      canEdit: true,
    });
    expect(result.text).toBe('Een lage toren aan zee');
  });

  it('and after the handover the room is the only voice', () => {
    // Someone empties the field; a later pass must let that stand rather than
    // treating the parent's stale copy as unsaved typing.
    const result = handover({
      local: 'Een toren',
      room: '',
      shown: 'Een toren',
      canEdit: true,
      first: false,
    });
    expect(result.text).toBe('');
    expect(result.toldParent).toBe('');
  });

  it('and never writes into a room this person may only look at', () => {
    const result = handover({ local: 'Een voorstel', room: '', canEdit: false });
    // Their words go to the parent's road (a proposal), not into the document.
    expect(result.text).toBe('');
  });

  it('does nothing at all when there was nothing to hand over', () => {
    const result = handover({ local: 'Een toren', room: 'Een toren', canEdit: true });
    expect(result.text).toBe('Een toren');
    expect(result.toldParent).toBeNull();
  });
});
