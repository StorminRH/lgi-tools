import { describe, expect, it } from 'vitest';
import { nodeFrameState } from './node-frame-state';

describe('nodeFrameState', () => {
  const empty = new Map<number, number>();

  it('is manual when an ME or TE override is set', () => {
    expect(nodeFrameState(1, empty, empty, new Map([[1, 5]]), empty)).toBe('manual');
    expect(nodeFrameState(1, empty, empty, empty, new Map([[1, 12]]))).toBe('manual');
  });

  it('lets a manual override win over an owned blueprint', () => {
    expect(nodeFrameState(1, new Map([[1, 8]]), new Map([[1, 16]]), new Map([[1, 0]]), empty)).toBe('manual');
  });

  it('is owned when the blueprint is owned and unoverridden — even an unresearched ME0/TE0 copy', () => {
    expect(nodeFrameState(1, new Map([[1, 0]]), new Map([[1, 0]]), empty, empty)).toBe('owned');
    expect(nodeFrameState(1, new Map([[1, 10]]), empty, empty, empty)).toBe('owned');
    expect(nodeFrameState(1, empty, new Map([[1, 20]]), empty, empty)).toBe('owned');
  });

  it('is unowned when neither owned nor overridden', () => {
    expect(nodeFrameState(1, empty, empty, empty, empty)).toBe('unowned');
    expect(nodeFrameState(1, new Map([[2, 5]]), new Map([[2, 10]]), empty, empty)).toBe('unowned');
  });

  it('treats a null owned map (read unsettled / logged out) as not owned', () => {
    expect(nodeFrameState(1, null, null, empty, empty)).toBe('unowned');
  });
});
