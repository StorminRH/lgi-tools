import { expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const h = vi.hoisted(() => ({ after: vi.fn(), logUsageEvent: vi.fn() }));
vi.mock('next/server', () => ({ after: h.after }));
vi.mock('./log', () => ({ logUsageEvent: h.logUsageEvent }));

import { emitUsageEvent, recordUsageEvent } from './usage-events';

test('records a usage event now with its character, and swallows a failed write under the scope', async () => {
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  const logged = silenceConsolePrefixes('error', ['[same-origin] telemetry write failed']);
  const event = { action: 'cross_origin_mutation', characterId: 90_000_001, metadata: { source: 'origin' } } as const;

  await recordUsageEvent('same-origin', event);
  expect(h.logUsageEvent).toHaveBeenCalledExactlyOnceWith(event);
  expect(logged).not.toHaveBeenCalled();

  const error = new Error('database unavailable');
  h.logUsageEvent.mockRejectedValueOnce(error);
  await expect(recordUsageEvent('same-origin', event)).resolves.toBeUndefined();
  expect(logged).toHaveBeenCalledExactlyOnceWith('[same-origin] telemetry write failed', error);
  logged.mockRestore();
});

test('emits a usage event after the response, resolving a lazy input only inside the scheduled task', async () => {
  h.after.mockReset();
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  const readCharacter = vi.fn(async () => ({ action: 'page_view' as const, characterId: 90_000_001, metadata: { path: '/' } }));

  emitUsageEvent('eve-token', { action: 'eve_token_refresh_race', characterId: 90_000_002 });
  emitUsageEvent('telemetry', readCharacter);

  expect(h.after).toHaveBeenCalledTimes(2);
  expect(readCharacter).not.toHaveBeenCalled();
  expect(h.logUsageEvent).not.toHaveBeenCalled();

  await h.after.mock.calls[0]![0]();
  await h.after.mock.calls[1]![0]();

  expect(h.logUsageEvent.mock.calls).toEqual([
    [{ action: 'eve_token_refresh_race', characterId: 90_000_002 }],
    [{ action: 'page_view', characterId: 90_000_001, metadata: { path: '/' } }],
  ]);
});

test('logs a failed lazy input under the scope and writes nothing', async () => {
  h.after.mockReset();
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  const logged = silenceConsolePrefixes('error', ['[telemetry] telemetry write failed']);
  const sessionError = new Error('session unavailable');

  emitUsageEvent('telemetry', () => Promise.reject(sessionError));

  await expect(h.after.mock.calls[0]![0]()).resolves.toBeUndefined();
  expect(h.logUsageEvent).not.toHaveBeenCalled();
  expect(logged).toHaveBeenCalledExactlyOnceWith('[telemetry] telemetry write failed', sessionError);
  logged.mockRestore();
});
