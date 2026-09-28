import { expect, test } from 'vitest';
import {
  STILL_WORMHOLE,
  WORMHOLE_IMPULSE_SETTLE_S,
  stepWormholeMotion,
  wormholeNeedsFrame,
} from './motion';

function advance(state = STILL_WORMHOLE, active = false, frames = 240) {
  for (let i = 0; i < frames; i += 1) state = stepWormholeMotion(state, 1 / 60, active, false);
  return state;
}

test('selection drives a finite impulse, release freezes it, and pause or a long frame cannot jump', () => {
  expect(wormholeNeedsFrame(STILL_WORMHOLE)).toBe(false);
  expect(advance()).toEqual(STILL_WORMHOLE);
  const impulse = stepWormholeMotion(STILL_WORMHOLE, 0, true, false);
  expect(impulse.age).toBe(0);
  const settled = advance(impulse, true);
  expect(settled.age).toBeGreaterThan(WORMHOLE_IMPULSE_SETTLE_S);
  expect(settled.time).toBeGreaterThan(0);
  expect(wormholeNeedsFrame(settled)).toBe(true);
  expect(advance(settled, true).age).toBeGreaterThan(settled.age);

  const released = advance(settled, false);
  expect(wormholeNeedsFrame(released)).toBe(false);
  expect(advance(released, false).time).toBe(released.time);
  const reentered = stepWormholeMotion(released, 0, true, false);
  expect(reentered.age).toBe(0);
  expect(reentered.time).toBe(released.time);

  const moving = advance(STILL_WORMHOLE, true, 20);
  const paused = stepWormholeMotion(moving, 10, true, true);
  expect(paused.active).toBe(true);
  expect(paused.age).toBe(10);
  expect(paused.speed).toBe(0);
  expect(paused.time).toBe(moving.time);
  const resumed = stepWormholeMotion(paused, 1 / 60, true, false);
  expect(resumed.age).toBeGreaterThan(WORMHOLE_IMPULSE_SETTLE_S);
  expect(stepWormholeMotion(moving, 100, true, false).time - moving.time).toBeLessThanOrEqual(0.05);
});
