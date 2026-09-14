import { expect, test } from 'vitest';
import { STILL_WORMHOLE, stepWormholeMotion, wormholeNeedsFrame } from './motion';

function advance(state = STILL_WORMHOLE, active = false, frames = 240) {
  for (let i = 0; i < frames; i += 1) state = stepWormholeMotion(state, 1 / 60, active, false);
  return state;
}

test('idle requires no frames; one activation emits a finite impulse with continuing wisps', () => {
  expect(wormholeNeedsFrame(STILL_WORMHOLE)).toBe(false);
  expect(advance()).toEqual(STILL_WORMHOLE);
  const impulse = stepWormholeMotion(STILL_WORMHOLE, 0, true, false);
  expect(impulse.age).toBe(0);
  const settled = advance(impulse, true);
  expect(settled.age).toBeGreaterThan(2.8);
  expect(settled.time).toBeGreaterThan(0);
  expect(wormholeNeedsFrame(settled)).toBe(true);
  expect(advance(settled, true).age).toBeGreaterThan(settled.age);
});

test('release settles to an exact freeze; reentry restarts the impulse without resetting wisps', () => {
  const selected = advance(STILL_WORMHOLE, true);
  const released = advance(selected, false);
  expect(wormholeNeedsFrame(released)).toBe(false);
  expect(advance(released, false).time).toBe(released.time);
  const reentered = stepWormholeMotion(released, 0, true, false);
  expect(reentered.age).toBe(0);
  expect(reentered.time).toBe(released.time);
});

test('pause immediately stills every effect, even if selected; background time cannot jump', () => {
  const moving = advance(STILL_WORMHOLE, true, 20);
  const paused = stepWormholeMotion(moving, 10, true, true);
  expect(wormholeNeedsFrame(paused)).toBe(false);
  expect(paused.age).toBe(10);
  expect(paused.time).toBe(moving.time);
  expect(stepWormholeMotion(moving, 100, true, false).time - moving.time).toBeLessThanOrEqual(0.05);
});
