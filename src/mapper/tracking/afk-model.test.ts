import { describe, expect, it } from 'vitest';
import { HIDDEN_PRESENCE_MAX_MS } from '@/lib/sync-engine';
import {
  AFK_HIDDEN_AFTER_MS,
  AFK_PROMPT_TIMEOUT_MS,
  type AfkConfig,
  afkConfigFromOverrides,
  initialAfkState,
  isAfkPaused,
  isAfkPromptOpen,
  onAfkDismiss,
  onAfkTick,
  onAfkVisibilityChange,
} from './afk-model';

const NOW = 1_750_000_000_000;
const CONFIG: AfkConfig = { hiddenAfterMs: 60 * 60_000, promptTimeoutMs: 5 * 60_000 };

describe('afk-model', () => {
  it('a visible mount starts active with no hidden anchor', () => {
    const state = initialAfkState(true, NOW);
    expect(state).toEqual({ phase: 'active', hiddenSince: null, promptedAt: null });
    expect(isAfkPromptOpen(state)).toBe(false);
    expect(isAfkPaused(state)).toBe(false);
  });

  it('a hidden mount anchors hidden continuity at mount time', () => {
    expect(initialAfkState(false, NOW).hiddenSince).toBe(NOW);
  });

  it('hide anchors, refocus clears, and a repeated hide keeps the original anchor', () => {
    let state = initialAfkState(true, NOW);
    state = onAfkVisibilityChange(state, false, NOW + 1_000);
    expect(state.hiddenSince).toBe(NOW + 1_000);
    // A duplicate hidden notification must not restart the clock.
    const repeated = onAfkVisibilityChange(state, false, NOW + 2_000);
    expect(repeated).toBe(state);
    state = onAfkVisibilityChange(state, true, NOW + 3_000);
    expect(state.hiddenSince).toBeNull();
  });

  it('prompts only after continuously hidden past the window', () => {
    let state = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
    const early = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs - 1);
    expect(early).toBe(state);
    state = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs);
    expect(state.phase).toBe('prompting');
    expect(state.promptedAt).toBe(NOW + CONFIG.hiddenAfterMs);
    expect(isAfkPromptOpen(state)).toBe(true);
    expect(isAfkPaused(state)).toBe(false);
  });

  it('never prompts while visible, however long the session', () => {
    const state = initialAfkState(true, NOW);
    expect(onAfkTick(state, CONFIG, NOW + 24 * 60 * 60_000)).toBe(state);
  });

  it('an interrupted hide resets the clock — brief alt-tabs never accumulate', () => {
    let state = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
    state = onAfkVisibilityChange(state, true, NOW + 30 * 60_000);
    state = onAfkVisibilityChange(state, false, NOW + 31 * 60_000);
    const tick = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs + 60_000);
    expect(tick.phase).toBe('active');
  });

  it('an unanswered prompt pauses after the response window', () => {
    let state = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
    state = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs);
    const promptedAt = state.promptedAt ?? 0;
    const waiting = onAfkTick(state, CONFIG, promptedAt + CONFIG.promptTimeoutMs - 1);
    expect(waiting.phase).toBe('prompting');
    state = onAfkTick(state, CONFIG, promptedAt + CONFIG.promptTimeoutMs);
    expect(state.phase).toBe('paused');
    expect(isAfkPromptOpen(state)).toBe(true);
    expect(isAfkPaused(state)).toBe(true);
  });

  it('refocusing keeps the prompt up — dismissal is the only recovery', () => {
    let state = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
    state = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs);
    const refocused = onAfkVisibilityChange(state, true, NOW + CONFIG.hiddenAfterMs + 1_000);
    expect(refocused).toBe(state);
    const paused = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs + CONFIG.promptTimeoutMs);
    expect(onAfkVisibilityChange(paused, true, NOW + 2 * CONFIG.hiddenAfterMs)).toBe(paused);
  });

  it('dismiss returns a fresh active state anchored to current visibility', () => {
    const visible = onAfkDismiss(true, NOW);
    expect(visible).toEqual({ phase: 'active', hiddenSince: null, promptedAt: null });
    // Dismissing while still hidden (e.g. a second monitor click-through) re-arms
    // the hidden clock from now rather than granting an unbounded session.
    expect(onAfkDismiss(false, NOW).hiddenSince).toBe(NOW);
  });
});

describe('afkConfigFromOverrides', () => {
  it('accepts positive numeric overrides', () => {
    expect(afkConfigFromOverrides('30000', '10000')).toEqual({
      hiddenAfterMs: 30_000,
      promptTimeoutMs: 10_000,
    });
  });

  it('falls back to production thresholds for absent or malformed values', () => {
    const production = {
      hiddenAfterMs: AFK_HIDDEN_AFTER_MS,
      promptTimeoutMs: AFK_PROMPT_TIMEOUT_MS,
    };
    expect(afkConfigFromOverrides(undefined, undefined)).toEqual(production);
    expect(afkConfigFromOverrides('', 'soon')).toEqual(production);
    // Zero/negative would mean an instant prompt — refused.
    expect(afkConfigFromOverrides('0', '-5')).toEqual(production);
  });
});

describe('server backstop ordering', () => {
  it('the hidden-presence backstop stays strictly behind the client AFK flow', () => {
    // One decision, two files: if the AFK thresholds ever grow past the
    // server's HIDDEN_PRESENCE_MAX_MS, the engine would go cold BEFORE the
    // prompt appears and tracking would die with no UI. Keep real margin for
    // throttled hidden ticks (~1/min resolution on every timer involved).
    const clientStopsAt = AFK_HIDDEN_AFTER_MS + AFK_PROMPT_TIMEOUT_MS;
    expect(HIDDEN_PRESENCE_MAX_MS - clientStopsAt).toBeGreaterThanOrEqual(10 * 60_000);
  });
});
