// Pure tween-scheduler state: intent batches in, per-frame displacements out.
//
// This module is the bookkeeping half of the position-tween scheduler (contract
// HC-1): it owns which nodes are mid-glide, entering, or departing, and where a
// glide currently stands — as data, with every timestamp an argument. No DOM,
// no React, no clock reads, so time-based completion (hidden-tab resume, ghost
// expiry) is a unit test rather than a browser observation.
//
// Key invariants carried here:
//   - A birth never tweens: `system-appeared` marks an entering window and the
//     node renders at its kernel target from the first frame (DC-1).
//   - A glide's origin is the `system-moved` intent's own `from` — never a
//     read-back of rendered output — and a retarget continues from the tween's
//     current displaced value, so no jump can paint (DC-2).
//   - A dragged node's tween is cancelled and it receives no displacement
//     write (HC-2).
//   - Ghost removal is clock-scheduled, never dependent on DOM event delivery,
//     and a re-appearing id drops its ghost in the same adoption (supersession).
import type { ChainPosition, MapChainIntent } from '../chain/intents';
import { samePosition } from '../chain/intents';
import type { TweenPlan } from './motion-contract';

/** One in-flight position glide. */
export interface Tween {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
  readonly startedAt: number;
  readonly durationMs: number;
}

/** One departed system or connection still playing its exit. */
export interface Ghost {
  readonly expiresAt: number;
  readonly heavy: boolean;
}

/**
 * The scheduler's whole world. Construct only through the functions below —
 * callers read it, they never assemble one by hand.
 */
export interface MotionState {
  readonly tweens: ReadonlyMap<number, Tween>;
  /** systemId → entering-window expiry timestamp. */
  readonly entering: ReadonlyMap<number, number>;
  readonly ghosts: ReadonlyMap<number, Ghost>;
  /** connectionId → entering-window expiry timestamp. */
  readonly edgeEntering: ReadonlyMap<string, number>;
  readonly edgeGhosts: ReadonlyMap<string, Ghost>;
}

const IDLE_STATE: MotionState = {
  tweens: new Map(),
  entering: new Map(),
  ghosts: new Map(),
  edgeEntering: new Map(),
  edgeGhosts: new Map(),
};

/** The empty, idle scheduler. */
export function createMotionState(): MotionState {
  return IDLE_STATE;
}

/** True when nothing is gliding, entering, or departing — the at-rest test (HC-5). */
export function isIdle(state: MotionState): boolean {
  return (
    state.tweens.size === 0
    && state.entering.size === 0
    && state.ghosts.size === 0
    && state.edgeEntering.size === 0
    && state.edgeGhosts.size === 0
  );
}

/** Where one tween's displaced position stands at `now`. */
function displacedAt(
  tween: Tween,
  now: number,
  ease: (t: number) => number,
): ChainPosition {
  if (tween.durationMs <= 0) return tween.to;
  const t = Math.min(1, Math.max(0, (now - tween.startedAt) / tween.durationMs));
  const eased = ease(t);
  return {
    x: tween.from.x + (tween.to.x - tween.from.x) * eased,
    y: tween.from.y + (tween.to.y - tween.from.y) * eased,
  };
}

/**
 * A collapse is a departure batch removing more than one system at once — the
 * reconciler emits a connected subtree's removal as a single batch, while an
 * ordinary removal departs exactly one system.
 */
function isCollapseBatch(intents: readonly MapChainIntent[]): boolean {
  let departures = 0;
  for (const intent of intents) {
    if (intent.kind === 'system-departed') departures += 1;
  }
  return departures > 1;
}

/**
 * Folds one merge's intent batch into the scheduler.
 *
 * Callers consume each distinct batch exactly once by identity (the camera's
 * discipline); an empty batch returns the same state so pin/release merges
 * schedule nothing.
 */
export function adoptIntents(
  state: MotionState,
  intents: readonly MapChainIntent[],
  now: number,
  plan: TweenPlan,
): MotionState {
  if (intents.length === 0) return state;

  const tweens = new Map(state.tweens);
  const entering = new Map(state.entering);
  const ghosts = new Map(state.ghosts);
  const edgeEntering = new Map(state.edgeEntering);
  const edgeGhosts = new Map(state.edgeGhosts);
  const heavy = plan.collapseHeavy && isCollapseBatch(intents);
  const exitMs = heavy ? plan.heavyExitMs : plan.exitMs;

  for (const intent of intents) {
    switch (intent.kind) {
      case 'system-appeared':
        // Births surface in place: an entering window, never a tween (DC-1).
        entering.set(intent.systemId, now + plan.birthMs);
        ghosts.delete(intent.systemId);
        tweens.delete(intent.systemId);
        break;
      case 'system-moved': {
        // A move landing inside the node's birth window relocates instantly:
        // the system is still surfacing, and its first real place is wherever
        // its attaching connection puts it. Without this, the split system/
        // connection subscriptions make every reveal surface unattached off to
        // the side and then zip onto the tree (operator direction 2026-08-02).
        // Read the working map, so a birth in this same batch counts too.
        const birthWindow = entering.get(intent.systemId);
        if (birthWindow !== undefined && birthWindow > now) {
          tweens.delete(intent.systemId);
          break;
        }
        const current = tweens.get(intent.systemId);
        // Origin: the intent's own `from`, or the current displaced value when
        // a glide is already in flight (retarget without a jump).
        const from =
          current === undefined
            ? intent.from
            : displacedAt(current, now, plan.ease);
        if (samePosition(from, intent.to)) {
          tweens.delete(intent.systemId);
          break;
        }
        tweens.set(intent.systemId, {
          from,
          to: intent.to,
          startedAt: now,
          durationMs: plan.moveMs,
        });
        break;
      }
      case 'system-departed':
        ghosts.set(intent.systemId, { expiresAt: now + exitMs, heavy });
        entering.delete(intent.systemId);
        tweens.delete(intent.systemId);
        break;
      case 'connection-appeared':
        edgeEntering.set(intent.connectionId, now + plan.birthMs);
        edgeGhosts.delete(intent.connectionId);
        break;
      case 'connection-departed':
        edgeGhosts.set(intent.connectionId, { expiresAt: now + exitMs, heavy });
        edgeEntering.delete(intent.connectionId);
        break;
    }
  }

  return { tweens, entering, ghosts, edgeEntering, edgeGhosts };
}

/** Drops the named nodes' tweens — drag start cancels, it never smooths (HC-2). */
export function cancelForDrag(
  state: MotionState,
  ids: ReadonlySet<number>,
): MotionState {
  if (ids.size === 0) return state;
  let changed = false;
  const tweens = new Map(state.tweens);
  for (const id of ids) {
    if (tweens.delete(id)) changed = true;
  }
  return changed ? { ...state, tweens } : state;
}

/** Resolves every in-flight glide instantly — the live reduced-motion flip. */
export function finishAllTweens(state: MotionState): MotionState {
  if (state.tweens.size === 0) return state;
  return { ...state, tweens: new Map() };
}

/** One advanced frame: the pruned state plus what a renderer can see of it. */
export interface MotionFrame {
  readonly state: MotionState;
  /** systemId → displaced position for every live glide this frame. */
  readonly displacements: ReadonlyMap<number, ChainPosition>;
  /** True while anything remains scheduled — the keep-the-loop-running test. */
  readonly active: boolean;
  /** True when this frame moved or expired anything a renderer could see. */
  readonly changed: boolean;
}

/**
 * Advances the scheduler to `now`: computes displaced positions, completes
 * finished glides, expires ghost and entering windows, and drops any tween
 * whose node the user is now dragging. Progress is time-based, so a hidden
 * tab's first resumed frame completes or advances correctly.
 */
export function stepMotion(
  state: MotionState,
  now: number,
  ease: (t: number) => number,
  draggingIds: ReadonlySet<number>,
): MotionFrame {
  const displacements = new Map<number, ChainPosition>();
  const tweens = new Map<number, Tween>();
  let changed = false;

  for (const [systemId, tween] of state.tweens) {
    if (draggingIds.has(systemId)) {
      // Cancel-on-drag through the live seam: no displacement write (HC-2).
      changed = true;
      continue;
    }
    if (now - tween.startedAt >= tween.durationMs) {
      // Complete: truth already holds `to`, so dropping the tween renders it.
      changed = true;
      continue;
    }
    displacements.set(systemId, displacedAt(tween, now, ease));
    tweens.set(systemId, tween);
    changed = true;
  }

  const entering = pruneBy(state.entering, (expiresAt) => expiresAt > now);
  const ghosts = pruneBy(state.ghosts, (ghost) => ghost.expiresAt > now);
  const edgeEntering = pruneBy(state.edgeEntering, (expiresAt) => expiresAt > now);
  const edgeGhosts = pruneBy(state.edgeGhosts, (ghost) => ghost.expiresAt > now);
  changed =
    changed
    || entering !== state.entering
    || ghosts !== state.ghosts
    || edgeEntering !== state.edgeEntering
    || edgeGhosts !== state.edgeGhosts;

  const next: MotionState = changed
    ? { tweens, entering, ghosts, edgeEntering, edgeGhosts }
    : state;
  return { state: next, displacements, active: !isIdle(next), changed };
}

/** Drops entries failing `keep`; returns the input map untouched when all pass. */
function pruneBy<Key, Value>(
  entries: ReadonlyMap<Key, Value>,
  keep: (value: Value) => boolean,
): ReadonlyMap<Key, Value> {
  let expired = false;
  for (const value of entries.values()) {
    if (!keep(value)) {
      expired = true;
      break;
    }
  }
  if (!expired) return entries;
  const kept = new Map<Key, Value>();
  for (const [key, value] of entries) {
    if (keep(value)) kept.set(key, value);
  }
  return kept;
}
