import { describe, expect, it } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import {
  decideCameraFit,
  nodesReadyForFit,
  planCameraFit,
  shouldFitView,
  systemsNeedingFit,
} from './camera-follow-model';

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

  it('waits until React Flow holds every appeared or moved system', () => {
    expect(systemsNeedingFit([...APPEARED, ...DEPARTED])).toEqual([1]);
    expect(nodesReadyForFit(APPEARED, new Set())).toBe(false);
    expect(nodesReadyForFit(APPEARED, new Set([1]))).toBe(true);
    expect(nodesReadyForFit(DEPARTED, new Set())).toBe(true);
  });

  it('decides ignore / wait / skip / fit without fitting stale nodes', () => {
    const base = {
      intents: APPEARED,
      previousIntents: DEPARTED,
      framed: false,
      follow: false,
      dragActive: false,
      nodeIds: new Set<number>(),
    };
    expect(decideCameraFit({ ...base, previousIntents: APPEARED })).toBe('ignore');
    expect(decideCameraFit(base)).toBe('wait');
    expect(decideCameraFit({ ...base, nodeIds: new Set([1]) })).toBe('fit');
    expect(
      decideCameraFit({
        ...base,
        intents: [{ kind: 'system-departed', systemId: 2 }],
        nodeIds: new Set(),
      }),
    ).toBe('skip');
    expect(planCameraFit('ignore')).toEqual({ consume: false, fit: false });
    expect(planCameraFit('wait')).toEqual({ consume: false, fit: false });
    expect(planCameraFit('skip')).toEqual({ consume: true, fit: false });
    expect(planCameraFit('fit')).toEqual({ consume: true, fit: true });
  });
});
