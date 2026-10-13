import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type * as Hooks from './use-available-structures';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);
vi.mock('@/transport/api-client', () => ({ apiFetch: h.apiFetch }));

let hooks: typeof Hooks;

const ok = (ids: string[], refreshing = false) => ({
  ok: true,
  data: { structures: ids.map((id) => ({ id })), refreshing },
});

beforeEach(async () => {
  rt.unmount();
  vi.resetModules();
  vi.useFakeTimers();
  h.apiFetch.mockReset();
  const identities = await import('@/platform/auth/read-identity');
  identities.publishReadIdentity({ userId: 'account-a', characterId: 7 });
  hooks = await import('./use-available-structures');
});

afterEach(() => {
  rt.unmount();
  vi.useRealTimers();
});

test('is null until the first read lands, re-reads after a user edit, and checks back while the corp structures refresh', async () => {
  h.apiFetch
    .mockResolvedValueOnce(ok(['cs-1'], true))
    .mockResolvedValueOnce(ok(['cs-1', 'corp:7']))
    .mockResolvedValue(ok(['cs-1', 'cs-2', 'corp:7']));
  expect(rt.render(hooks.useAvailableStructures)).toBeNull();
  expect(h.apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/account/structures' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(hooks.useAvailableStructures)).toEqual([{ id: 'cs-1' }]);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(rt.render(hooks.useAvailableStructures)).toEqual([{ id: 'cs-1' }, { id: 'corp:7' }]);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);

  hooks.refreshAvailableStructures();
  rt.render(hooks.useAvailableStructures);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(0);
  expect(rt.render(hooks.useAvailableStructures)).toEqual([{ id: 'cs-1' }, { id: 'cs-2' }, { id: 'corp:7' }]);
});
