// AFK detection for Atlas tracking. A hidden tab keeps heartbeating (browser-
// throttled), so "tab hidden" no longer stops tracking by itself — this model
// decides when a long-hidden tab probably means the pilot walked away: after
// hiddenAfterMs continuously hidden the UI shows an AFK prompt, and after
// promptTimeoutMs unanswered the caller stops heartbeating (the engine then
// goes cold on its own). The prompt persists until explicitly dismissed — a
// returning player finds it waiting and one click resumes tracking.
//
// Pure and clock-injected so every transition is unit-testable; the component
// owns timers and feeds ticks. State identity is preserved on no-op
// transitions so React setState callers skip re-renders.

/** Where the AFK flow stands: tracking live, prompt showing, or beats stopped. */
export type AfkPhase = 'active' | 'prompting' | 'paused';

/** One immutable snapshot of the AFK state machine. */
export interface AfkState {
  readonly phase: AfkPhase;
  /** When the tab went continuously hidden; null while visible (active phase only). */
  readonly hiddenSince: number | null;
  /** When the AFK prompt appeared; null before prompting. */
  readonly promptedAt: number | null;
}

/** Continuous hidden time before the AFK prompt appears. */
export const AFK_HIDDEN_AFTER_MS = 60 * 60_000;

/** Unanswered-prompt window before heartbeats stop. */
export const AFK_PROMPT_TIMEOUT_MS = 5 * 60_000;

/**
 * Coarse tick driving the time-based transitions. Hidden-tab timer throttling
 * (~1/min) only delays a transition by that resolution — irrelevant at these
 * scales.
 */
export const AFK_TICK_MS = 30_000;

/** Injectable thresholds — production uses the constants; probes shorten them. */
export interface AfkConfig {
  readonly hiddenAfterMs: number;
  readonly promptTimeoutMs: number;
}

/**
 * Thresholds from raw dev/probe env overrides: a positive finite number wins,
 * anything else (absent, empty, NaN, ≤0) falls back to production values —
 * a malformed override must never yield an instant or never-firing prompt.
 */
export function afkConfigFromOverrides(hiddenRaw: unknown, timeoutRaw: unknown): AfkConfig {
  const hidden = Number(hiddenRaw);
  const timeout = Number(timeoutRaw);
  return {
    hiddenAfterMs: Number.isFinite(hidden) && hidden > 0 ? hidden : AFK_HIDDEN_AFTER_MS,
    promptTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : AFK_PROMPT_TIMEOUT_MS,
  };
}

/** A fresh active state anchored to the tab's current visibility. */
export function initialAfkState(visible: boolean, now: number): AfkState {
  return { phase: 'active', hiddenSince: visible ? null : now, promptedAt: null };
}

/**
 * Visibility transition. Only the active phase tracks hidden continuity; once
 * the prompt is up it persists across refocus — dismissal is the only way
 * back (the operator-decided recovery interaction).
 */
export function onAfkVisibilityChange(state: AfkState, visible: boolean, now: number): AfkState {
  if (state.phase !== 'active') return state;
  const hiddenSince = visible ? null : (state.hiddenSince ?? now);
  return hiddenSince === state.hiddenSince ? state : { ...state, hiddenSince };
}

/** Clock tick: active→prompting past the hidden window, prompting→paused past the response window. */
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

/** The Continue click (from any phase): back to a fresh active state. */
export function onAfkDismiss(visible: boolean, now: number): AfkState {
  return initialAfkState(visible, now);
}

/** True once heartbeats must stop (unanswered prompt timed out). */
export function isAfkPaused(state: AfkState): boolean {
  return state.phase === 'paused';
}

/** True while the AFK prompt should be rendered (prompting or paused). */
export function isAfkPromptOpen(state: AfkState): boolean {
  return state.phase !== 'active';
}
