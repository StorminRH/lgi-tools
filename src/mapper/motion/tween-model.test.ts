import { expect, test } from 'vitest';
import type { MapChainIntent } from '../chain/intents';
import { springFamily, tweenPlanOf, DEFAULT_MOTION_CONFIG } from './motion-contract';
import {
  adoptIntents,
  createMotionState,
  finishAllTweens,
  isIdle,
  pruneBy,
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

test('never creates a positional tween for an arrival', () => {
  const state = adoptIntents(createMotionState(), [appeared(31)], 1000, PLAN);

  expect(state.tweens.size).toBe(0);
  expect(state.entering.has(31)).toBe(true);
  const frame = stepMotion(state, 1000, EASE);
  expect(frame.displacements.size).toBe(0);
});

test('retargets mid-flight from the current displaced value, no jump', () => {
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

test('relocates instantly — no tween — when the move lands inside the birth window', () => {
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

test('suppresses a no-op move whose origin equals its target', () => {
  const state = adoptIntents(
    createMotionState(),
    [moved(31, { x: 5, y: 5 }, { x: 5, y: 5 })],
    0,
    PLAN,
  );

  expect(state.tweens.size).toBe(0);
});

test('collapses to instant placement when the plan carries zero duration', () => {
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

test('creates a clock-bounded ghost that expires on schedule', () => {
  const state = adoptIntents(createMotionState(), [departed(31)], 0, PLAN);

  expect(state.ghosts.get(31)).toMatchObject({ expiresAt: PLAN.exitMs, heavy: false });
  const before = stepMotion(state, PLAN.exitMs - 1, EASE);
  expect(before.state.ghosts.has(31)).toBe(true);
  const after = stepMotion(state, PLAN.exitMs, EASE);
  expect(after.state.ghosts.has(31)).toBe(false);
});

test('weighs a wormhole collapse as heavy, but a bare removal or the shipped default as ordinary', () => {
  const connectionDeparted = { kind: 'connection-departed', connectionId: 'c1' } as MapChainIntent;
  const collapse = adoptIntents(
    createMotionState(),
    [departed(31), departed(32), connectionDeparted],
    0,
    HEAVY_PLAN,
  );
  expect(collapse.ghosts.get(31)?.heavy).toBe(true);
  expect(collapse.ghosts.get(32)?.heavy).toBe(true);
  expect(collapse.ghosts.get(31)?.expiresAt).toBe(HEAVY_PLAN.heavyExitMs);
  expect(collapse.edgeGhosts.get('c1')?.heavy).toBe(true);

  const bare = adoptIntents(
    createMotionState(),
    [departed(31), departed(32)],
    0,
    HEAVY_PLAN,
  );
  expect(bare.ghosts.get(31)?.heavy).toBe(false);

  const shipped = adoptIntents(createMotionState(), [departed(31), connectionDeparted], 0, PLAN);
  expect(shipped.ghosts.get(31)?.heavy).toBe(false);
});

test('starts idle and returns to idle when the schedule drains', () => {
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

test('reports no visible change when only unexpired windows persist or an empty batch lands', () => {
  const state = adoptIntents(createMotionState(), [appeared(1)], 0, PLAN);

  const frame = stepMotion(state, 1, EASE);
  expect(frame.changed).toBe(false);
  expect(frame.active).toBe(true);
  expect(frame.state).toBe(state);
  expect(adoptIntents(state, [], 1, PLAN)).toBe(state);
});

test('finishAllTweens resolves every in-flight glide instantly and leaves windows alone', () => {
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

test('pruneBy filters by key without mutating its input', () => {
  const expiries = new Map([[1, 100], [2, 200], [3, 300]]);
  const live = new Map([[1, 'a'], [3, 'c']]);
  const byKey = pruneBy(expiries, (_, systemId) => live.has(systemId));
  expect([...byKey]).toEqual([[1, 100], [3, 300]]);
  expect([...expiries]).toEqual([[1, 100], [2, 200], [3, 300]]);
});
