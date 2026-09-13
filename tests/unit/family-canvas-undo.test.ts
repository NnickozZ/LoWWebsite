import { describe, expect, it } from 'vitest';
import { createUndoStack, UNDO_LIMIT } from '@/components/families/treeUndo';

/**
 * §66 — Ctrl+Z on a stamboom.
 *
 * The stack itself, without a canvas round it: what it remembers, what it
 * forgets when it is full, and that a pop on nothing is not an error. The
 * *policy* — that only the tree's own state goes on here and never a field on
 * an artikel — is a rule of the canvas and is written down in `treeUndo.ts`;
 * what is testable here is that the bookkeeping does not lose a step.
 */

describe('§66 de ongedaan-stapel', () => {
  it('hands back the last thing pushed, and then the one before it', () => {
    const stack = createUndoStack<string>();
    stack.push('a');
    stack.push('b');
    expect(stack.pop()).toBe('b');
    expect(stack.pop()).toBe('a');
    expect(stack.pop()).toBeUndefined();
  });

  it('is empty rather than broken when there is nothing to go back to', () => {
    const stack = createUndoStack<number>();
    expect(stack.size()).toBe(0);
    expect(stack.pop()).toBeUndefined();
    expect(stack.size()).toBe(0);
  });

  it('drops the oldest step rather than refusing the newest', () => {
    const stack = createUndoStack<number>(3);
    for (const value of [1, 2, 3, 4, 5]) stack.push(value);
    expect(stack.size()).toBe(3);
    expect(stack.pop()).toBe(5);
    expect(stack.pop()).toBe(4);
    expect(stack.pop()).toBe(3);
    expect(stack.pop()).toBeUndefined();
  });

  it('is fifty deep by default, and survives a nonsense limit', () => {
    expect(UNDO_LIMIT).toBe(50);
    const stack = createUndoStack<number>(0);
    for (let i = 0; i < 60; i++) stack.push(i);
    expect(stack.size()).toBe(UNDO_LIMIT);
    expect(stack.pop()).toBe(59);
  });

  it('forgets everything when it is cleared', () => {
    const stack = createUndoStack<string>();
    stack.push('a');
    stack.clear();
    expect(stack.size()).toBe(0);
    expect(stack.pop()).toBeUndefined();
  });

  it('keeps the object it was handed, not a copy of it', () => {
    const stack = createUndoStack<{ members: string[] }>();
    const snapshot = { members: ['a'] };
    stack.push(snapshot);
    expect(stack.pop()).toBe(snapshot);
  });
});
