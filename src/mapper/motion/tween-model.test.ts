import { describe, expect, it } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import { springFamily, tweenPlanOf, DEFAULT_MOTION_CONFIG } from './motion-contract';
import {
  adoptIntents,
  createMotionState,
  finishAllTweens,
  isIdle,
  stepMotion,
} from './tween-model';

const PLAN = tweenPlanOf(DEFAULT_MOTION_CONFIG, false);
const HEAVY_PLAN = tweenPlanOf(
  { ...DEFAULT_MOTION_CONFIG, collapseWeight: 'heavy' },
  false,
);
const EASE = springFamily(DEFAULT_MOTION_CONFIG.overshootPct).ease;

const appeared = (systemId: number): MapChainIntent => ({
  kind: 'system-appeared',
  systemId,
  position: { x: 10, y: 20 },
});
const moved = (
  systemId: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): MapChainIntent => ({ kind: 'system-moved', systemId, from, to });
const departed = (systemId: number): MapChainIntent => ({
  kind: 'system-departed',
  systemId,
});

describe('appear path', () => {
  it('never creates a positional tween for an arrival', () => {
    const state = adoptIntents(createMotionState(), [appeared(31)], 1000, PLAN);

    expect(state.tweens.size).toBe(0);
    expect(state.entering.has(31)).toBe(true);
    const frame = stepMotion(state, 1000, EASE);
    expect(frame.displacements.size).toBe(0);
  });

  it('covers initial load and live insertion with the same vocabulary', () => {
    const batch = [appeared(1), appeared(2), appeared(3)];
    const state = adoptIntents(createMotionState(), batch, 0, PLAN);

    expect(state.entering.size).toBe(3);
    expect(state.tweens.size).toBe(0);
  });
});

describe('move path', () => {
  it('adopts origin and target from the intent itself, not from any read-back', () => {
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 50 })],
      1000,
      PLAN,
    );

    const tween = state.tweens.get(31);
    expect(tween).toMatchObject({ from: { x: 0, y: 0 }, to: { x: 100, y: 50 } });
  });

  it('steps displaced positions along the spring family', () => {
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })],
      0,
      PLAN,
    );

    const halfway = stepMotion(state, PLAN.moveMs / 2, EASE);
    const expected = 100 * EASE(0.5);
    expect(halfway.displacements.get(31)?.x).toBeCloseTo(expected, 6);
    expect(halfway.active).toBe(true);
  });

  it('retargets mid-flight from the current displaced value, no jump', () => {
    let state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })],
      0,
      PLAN,
    );
    const midpoint = 100 * EASE(0.5);

    state = adoptIntents(
      state,
      [moved(31, { x: 0, y: 0 }, { x: -40, y: 0 })],
      PLAN.moveMs / 2,
      PLAN,
    );

    const tween = state.tweens.get(31);
    expect(tween?.from.x).toBeCloseTo(midpoint, 6);
    expect(tween?.to).toEqual({ x: -40, y: 0 });
    const frame = stepMotion(state, PLAN.moveMs / 2, EASE);
    expect(frame.displacements.get(31)?.x).toBeCloseTo(midpoint, 6);
  });

  it('relocates instantly — no tween — when the move lands inside the birth window', () => {
    let state = adoptIntents(createMotionState(), [appeared(31)], 0, PLAN);
    state = adoptIntents(
      state,
      [moved(31, { x: 10, y: 20 }, { x: 300, y: -150 })],
      200,
      PLAN,
    );

    expect(state.tweens.size).toBe(0);
    expect(state.entering.has(31)).toBe(true);

    const settled = stepMotion(state, PLAN.birthMs + 1, EASE).state;
    const gliding = adoptIntents(
      settled,
      [moved(31, { x: 300, y: -150 }, { x: 0, y: 0 })],
      PLAN.birthMs + 10,
      PLAN,
    );
    expect(gliding.tweens.has(31)).toBe(true);
  });

  it('treats a birth and its tree placement in one batch as surfacing in place', () => {
    const state = adoptIntents(
      createMotionState(),
      [appeared(31), moved(31, { x: 10, y: 20 }, { x: 300, y: -150 })],
      0,
      PLAN,
    );

    expect(state.tweens.size).toBe(0);
    expect(state.entering.has(31)).toBe(true);
  });

  it('suppresses a no-op move whose origin equals its target', () => {
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 5, y: 5 }, { x: 5, y: 5 })],
      0,
      PLAN,
    );

    expect(state.tweens.size).toBe(0);
  });

  it('completes on time-based progress across a simulated hidden-tab gap', () => {
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })],
      0,
      PLAN,
    );

    const resumed = stepMotion(state, PLAN.moveMs * 10, EASE);
    expect(resumed.displacements.size).toBe(0);
    expect(resumed.state.tweens.size).toBe(0);
  });

  it('collapses to instant placement when the plan carries zero duration', () => {
    const reducedPlan = tweenPlanOf(DEFAULT_MOTION_CONFIG, true);
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })],
      0,
      reducedPlan,
    );

    const frame = stepMotion(state, 0, EASE);
    expect(frame.displacements.size).toBe(0);
    expect(frame.state.tweens.size).toBe(0);
  });
});


describe('batch discipline', () => {
  it('returns the same state for an empty batch', () => {
    const state = adoptIntents(
      createMotionState(),
      [moved(31, { x: 0, y: 0 }, { x: 100, y: 0 })],
      0,
      PLAN,
    );

    expect(adoptIntents(state, [], 100, PLAN)).toBe(state);
  });
});

describe('departure path', () => {
  it('creates a clock-bounded ghost that expires on schedule', () => {
    const state = adoptIntents(createMotionState(), [departed(31)], 0, PLAN);

    expect(state.ghosts.get(31)).toMatchObject({ expiresAt: PLAN.exitMs, heavy: false });
    const before = stepMotion(state, PLAN.exitMs - 1, EASE);
    expect(before.state.ghosts.has(31)).toBe(true);
    const after = stepMotion(state, PLAN.exitMs, EASE);
    expect(after.state.ghosts.has(31)).toBe(false);
  });

  it('drops the ghost when its id re-appears (supersession)', () => {
    let state = adoptIntents(createMotionState(), [departed(31)], 0, PLAN);
    state = adoptIntents(state, [appeared(31)], 100, PLAN);

    expect(state.ghosts.has(31)).toBe(false);
    expect(state.entering.has(31)).toBe(true);
  });

  it('weighs a wormhole collapse — system and connection departing together — as heavy', () => {
    const collapse = [
      departed(31),
      { kind: 'connection-departed', connectionId: 'c1' } as MapChainIntent,
    ];
    const state = adoptIntents(createMotionState(), collapse, 0, HEAVY_PLAN);

    expect(state.ghosts.get(31)?.heavy).toBe(true);
    expect(state.ghosts.get(31)?.expiresAt).toBe(HEAVY_PLAN.heavyExitMs);
    expect(state.edgeGhosts.get('c1')?.heavy).toBe(true);
  });

  it('weighs a whole departing subtree batch as heavy too', () => {
    const collapse = [
      departed(31),
      departed(32),
      { kind: 'connection-departed', connectionId: 'c1' } as MapChainIntent,
    ];
    const state = adoptIntents(createMotionState(), collapse, 0, HEAVY_PLAN);

    expect(state.ghosts.get(32)?.heavy).toBe(true);
  });

  it('keeps a bare system removal ordinary, and everything ordinary at the shipped default', () => {
    const single = adoptIntents(createMotionState(), [departed(31)], 0, HEAVY_PLAN);
    expect(single.ghosts.get(31)?.heavy).toBe(false);

    const bare = adoptIntents(
      createMotionState(),
      [departed(31), departed(32)],
      0,
      HEAVY_PLAN,
    );
    expect(bare.ghosts.get(31)?.heavy).toBe(false);

    const state = adoptIntents(
      createMotionState(),
      [departed(31), { kind: 'connection-departed', connectionId: 'c1' } as MapChainIntent],
      0,
      PLAN,
    );
    expect(state.ghosts.get(31)?.heavy).toBe(false);
  });
});

describe('idle detection', () => {
  it('starts idle and returns to idle when the schedule drains', () => {
    expect(isIdle(createMotionState())).toBe(true);

    const busy = adoptIntents(
      createMotionState(),
      [appeared(1), moved(2, { x: 0, y: 0 }, { x: 10, y: 0 }), departed(3)],
      0,
      PLAN,
    );
    expect(isIdle(busy)).toBe(false);

    const drained = stepMotion(busy, PLAN.heavyExitMs + PLAN.moveMs + 1, EASE);
    expect(isIdle(drained.state)).toBe(true);
    expect(drained.active).toBe(false);
  });

  it('reports no visible change when only unexpired windows persist', () => {
    const state = adoptIntents(createMotionState(), [appeared(1)], 0, PLAN);

    const frame = stepMotion(state, 1, EASE);
    expect(frame.changed).toBe(false);
    expect(frame.active).toBe(true);
    expect(frame.state).toBe(state);
  });
});

describe('finishAllTweens', () => {
  it('resolves every in-flight glide instantly and leaves windows alone', () => {
    const state = adoptIntents(
      createMotionState(),
      [appeared(1), moved(2, { x: 0, y: 0 }, { x: 10, y: 0 })],
      0,
      PLAN,
    );

    const finished = finishAllTweens(state);
    expect(finished.tweens.size).toBe(0);
    expect(finished.entering.has(1)).toBe(true);
    expect(finishAllTweens(finished)).toBe(finished);
  });
});
