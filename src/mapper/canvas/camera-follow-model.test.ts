import { describe, expect, it } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import { shouldFitView } from './camera-follow-model';

const APPEARED: readonly MapChainIntent[] = [
  { kind: 'system-appeared', systemId: 1, position: { x: 0, y: 0 } },
];
const MOVED: readonly MapChainIntent[] = [
  { kind: 'system-moved', systemId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
];
const DEPARTED: readonly MapChainIntent[] = [{ kind: 'system-departed', systemId: 1 }];

describe('camera fit policy', () => {
  it('frames once on the first appearance even with follow off', () => {
    expect(
      shouldFitView({ intents: APPEARED, framed: false, follow: false, dragActive: false }),
    ).toBe(true);
  });

  it('after framing, refits only while follow is on and no drag is active', () => {
    expect(
      shouldFitView({ intents: MOVED, framed: true, follow: true, dragActive: false }),
    ).toBe(true);
    expect(
      shouldFitView({ intents: MOVED, framed: true, follow: false, dragActive: false }),
    ).toBe(false);
    expect(
      shouldFitView({ intents: APPEARED, framed: true, follow: true, dragActive: true }),
    ).toBe(false);
  });

  it('never fits on merges without appearances or moves', () => {
    expect(
      shouldFitView({ intents: DEPARTED, framed: false, follow: true, dragActive: false }),
    ).toBe(false);
    expect(shouldFitView({ intents: [], framed: true, follow: true, dragActive: false })).toBe(
      false,
    );
  });
});
