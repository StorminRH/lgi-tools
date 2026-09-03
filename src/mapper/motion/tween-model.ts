import type { ChainPosition, MapChainIntent } from '../chain/intents';
import { samePosition } from '../chain/intents';
import type { TweenPlan } from './motion-contract';

export interface Tween {
  readonly from: ChainPosition;
  readonly to: ChainPosition;
  readonly startedAt: number;
  readonly durationMs: number;
}

export interface Ghost {
  readonly expiresAt: number;
  readonly heavy: boolean;
}

export interface MotionState {
  readonly tweens: ReadonlyMap<number, Tween>;
  readonly entering: ReadonlyMap<number, number>;
  readonly ghosts: ReadonlyMap<number, Ghost>;
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

export function createMotionState(): MotionState {
  return IDLE_STATE;
}

export function isIdle(state: MotionState): boolean {
  return (
    state.tweens.size === 0
    && state.entering.size === 0
    && state.ghosts.size === 0
    && state.edgeEntering.size === 0
    && state.edgeGhosts.size === 0
  );
}

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

function isCollapseBatch(intents: readonly MapChainIntent[]): boolean {
  let systemDeparted = false;
  let connectionDeparted = false;
  for (const intent of intents) {
    if (intent.kind === 'system-departed') systemDeparted = true;
    else if (intent.kind === 'connection-departed') connectionDeparted = true;
  }
  return systemDeparted && connectionDeparted;
}

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
        entering.set(intent.systemId, now + plan.birthMs);
        ghosts.delete(intent.systemId);
        tweens.delete(intent.systemId);
        break;
      case 'system-moved':
        adoptMove(tweens, entering, intent, now, plan);
        break;
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

function adoptMove(
  tweens: Map<number, Tween>,
  entering: ReadonlyMap<number, number>,
  intent: Extract<MapChainIntent, { kind: 'system-moved' }>,
  now: number,
  plan: TweenPlan,
): void {
  const birthWindow = entering.get(intent.systemId);
  if (birthWindow !== undefined && birthWindow > now) {
    tweens.delete(intent.systemId);
    return;
  }
  const current = tweens.get(intent.systemId);
  const from =
    current === undefined ? intent.from : displacedAt(current, now, plan.ease);
  if (samePosition(from, intent.to)) {
    tweens.delete(intent.systemId);
    return;
  }
  tweens.set(intent.systemId, {
    from,
    to: intent.to,
    startedAt: now,
    durationMs: plan.moveMs,
  });
}

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

export function finishAllTweens(state: MotionState): MotionState {
  if (state.tweens.size === 0) return state;
  return { ...state, tweens: new Map() };
}

export interface MotionFrame {
  readonly state: MotionState;
  readonly displacements: ReadonlyMap<number, ChainPosition>;
  readonly active: boolean;
  readonly changed: boolean;
}

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
      changed = true;
      continue;
    }
    if (now - tween.startedAt >= tween.durationMs) {
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
