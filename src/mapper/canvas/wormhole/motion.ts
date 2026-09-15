export interface WormholeMotion {
  readonly time: number;
  readonly age: number;
  readonly speed: number;
  readonly active: boolean;
}

/** Shader wobble/ripple envelope dies here; keep in lockstep with `shaders.ts`. */
export const WORMHOLE_IMPULSE_SETTLE_S = 2.8;

export const STILL_WORMHOLE: WormholeMotion = { time: 0, age: 10, speed: 0, active: false };

/** Only the inactive-to-active transition emits a ripple/wobble impulse. */
export function stepWormholeMotion(
  state: WormholeMotion,
  elapsed: number,
  active: boolean,
  paused: boolean,
): WormholeMotion {
  if (paused) return { time: state.time, age: 10, speed: 0, active: state.active };
  const dt = Math.max(0, Math.min(0.05, elapsed));
  const age = active && !state.active ? 0 : Math.min(10, state.age + dt);
  let speed = state.speed + ((active ? 1 : 0) - state.speed) * (1 - Math.exp(-dt * 5));
  if (!active && speed < 0.002) speed = 0;
  return { time: state.time + dt * speed, age, speed, active };
}

export function wormholeNeedsFrame(state: WormholeMotion): boolean {
  return state.active || state.age < WORMHOLE_IMPULSE_SETTLE_S || state.speed > 0;
}
