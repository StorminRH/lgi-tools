import { expect, test } from 'vitest';
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

test('AFK lifecycle: hide, prompt, pause, refocus, and dismiss', () => {
  const visibleMount = initialAfkState(true, NOW);
  expect(visibleMount).toEqual({ phase: 'active', hiddenSince: null, promptedAt: null });
  expect(isAfkPromptOpen(visibleMount)).toBe(false);
  expect(isAfkPaused(visibleMount)).toBe(false);
  expect(initialAfkState(false, NOW).hiddenSince).toBe(NOW);

  let state = initialAfkState(true, NOW);
  state = onAfkVisibilityChange(state, false, NOW + 1_000);
  expect(state.hiddenSince).toBe(NOW + 1_000);
  const repeated = onAfkVisibilityChange(state, false, NOW + 2_000);
  expect(repeated).toBe(state);
  state = onAfkVisibilityChange(state, true, NOW + 3_000);
  expect(state.hiddenSince).toBeNull();

  state = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
  expect(onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs - 1)).toBe(state);
  state = onAfkTick(state, CONFIG, NOW + CONFIG.hiddenAfterMs);
  expect(state.phase).toBe('prompting');
  expect(state.promptedAt).toBe(NOW + CONFIG.hiddenAfterMs);
  expect(isAfkPromptOpen(state)).toBe(true);
  expect(isAfkPaused(state)).toBe(false);

  const alwaysVisible = initialAfkState(true, NOW);
  expect(onAfkTick(alwaysVisible, CONFIG, NOW + 24 * 60 * 60_000)).toBe(alwaysVisible);

  let interrupted = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
  interrupted = onAfkVisibilityChange(interrupted, true, NOW + 30 * 60_000);
  interrupted = onAfkVisibilityChange(interrupted, false, NOW + 31 * 60_000);
  expect(onAfkTick(interrupted, CONFIG, NOW + CONFIG.hiddenAfterMs + 60_000).phase).toBe(
    'active',
  );

  let prompting = onAfkVisibilityChange(initialAfkState(true, NOW), false, NOW);
  prompting = onAfkTick(prompting, CONFIG, NOW + CONFIG.hiddenAfterMs);
  const promptedAt = prompting.promptedAt ?? 0;
  expect(onAfkTick(prompting, CONFIG, promptedAt + CONFIG.promptTimeoutMs - 1).phase).toBe(
    'prompting',
  );
  const paused = onAfkTick(prompting, CONFIG, promptedAt + CONFIG.promptTimeoutMs);
  expect(paused.phase).toBe('paused');
  expect(isAfkPromptOpen(paused)).toBe(true);
  expect(isAfkPaused(paused)).toBe(true);

  // Refocus keeps the prompt; dismissal is the only recovery.
  expect(
    onAfkVisibilityChange(prompting, true, NOW + CONFIG.hiddenAfterMs + 1_000),
  ).toBe(prompting);
  expect(onAfkVisibilityChange(paused, true, NOW + 2 * CONFIG.hiddenAfterMs)).toBe(paused);

  expect(onAfkDismiss(true, NOW)).toEqual({
    phase: 'active',
    hiddenSince: null,
    promptedAt: null,
  });
  expect(onAfkDismiss(false, NOW).hiddenSince).toBe(NOW);
});

test('AFK config overrides and server backstop ordering', () => {
  expect(afkConfigFromOverrides('30000', '10000')).toEqual({
    hiddenAfterMs: 30_000,
    promptTimeoutMs: 10_000,
  });
  const production = {
    hiddenAfterMs: AFK_HIDDEN_AFTER_MS,
    promptTimeoutMs: AFK_PROMPT_TIMEOUT_MS,
  };
  expect(afkConfigFromOverrides(undefined, undefined)).toEqual(production);
  expect(afkConfigFromOverrides('', 'soon')).toEqual(production);
  // Zero/negative would mean an instant prompt — refused.
  expect(afkConfigFromOverrides('0', '-5')).toEqual(production);

  // Sole falsifier: engine must not go cold before the client AFK UI can prompt.
  const clientStopsAt = AFK_HIDDEN_AFTER_MS + AFK_PROMPT_TIMEOUT_MS;
  expect(HIDDEN_PRESENCE_MAX_MS - clientStopsAt).toBeGreaterThanOrEqual(10 * 60_000);
});
