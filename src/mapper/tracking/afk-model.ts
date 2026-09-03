export type AfkPhase = 'active' | 'prompting' | 'paused';

export interface AfkState {
  readonly phase: AfkPhase;
  readonly hiddenSince: number | null;
  readonly promptedAt: number | null;
}

export const AFK_HIDDEN_AFTER_MS = 60 * 60_000;

export const AFK_PROMPT_TIMEOUT_MS = 5 * 60_000;

export const AFK_TICK_MS = 30_000;

export interface AfkConfig {
  readonly hiddenAfterMs: number;
  readonly promptTimeoutMs: number;
}

export function afkConfigFromOverrides(hiddenRaw: unknown, timeoutRaw: unknown): AfkConfig {
  const hidden = Number(hiddenRaw);
  const timeout = Number(timeoutRaw);
  return {
    hiddenAfterMs: Number.isFinite(hidden) && hidden > 0 ? hidden : AFK_HIDDEN_AFTER_MS,
    promptTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : AFK_PROMPT_TIMEOUT_MS,
  };
}

export function initialAfkState(visible: boolean, now: number): AfkState {
  return { phase: 'active', hiddenSince: visible ? null : now, promptedAt: null };
}

export function onAfkVisibilityChange(state: AfkState, visible: boolean, now: number): AfkState {
  if (state.phase !== 'active') return state;
  const hiddenSince = visible ? null : (state.hiddenSince ?? now);
  return hiddenSince === state.hiddenSince ? state : { ...state, hiddenSince };
}

export function onAfkTick(state: AfkState, config: AfkConfig, now: number): AfkState {
  if (state.phase === 'active') {
    const promptDue =
      state.hiddenSince !== null && now - state.hiddenSince >= config.hiddenAfterMs;
    return promptDue ? { ...state, phase: 'prompting', promptedAt: now } : state;
  }
  if (state.phase === 'prompting' && now - (state.promptedAt ?? now) >= config.promptTimeoutMs) {
    return { ...state, phase: 'paused' };
  }
  return state;
}

export function onAfkDismiss(visible: boolean, now: number): AfkState {
  return initialAfkState(visible, now);
}

export function isAfkPaused(state: AfkState): boolean {
  return state.phase === 'paused';
}

export function isAfkPromptOpen(state: AfkState): boolean {
  return state.phase !== 'active';
}
