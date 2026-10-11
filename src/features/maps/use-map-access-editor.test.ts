import { expect, test, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
const h = vi.hoisted(() => ({ refresh: vi.fn(), updateMapAccess: vi.fn() }));

vi.mock('react', () => rt.react);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh }) }));
vi.mock('./map-access-client', () => ({
  updateMapAccess: h.updateMapAccess,
  mapAccessFailureMessage: (outcome: { status: number }) => `failed with ${outcome.status}`,
}));

import { useMapAccessWrite, useServerDraft } from './use-map-access-editor';

test('a server draft keeps local rows through same-revision props and reseeds from them on a new revision', () => {
  rt.unmount();
  const seeds: (readonly string[] | null)[] = [];
  // Keeps the local rows still pending, as the grant editor keeps unsaved picks.
  const seed = (server: readonly string[], current: string[] | null) => {
    seeds.push(current);
    return [...server, ...(current ?? []).filter((row) => row.startsWith('pending'))];
  };
  const render = (server: readonly string[]) =>
    rt.render(useServerDraft<readonly string[], string[]>, server, server.join(','), seed);

  const [first, setDraft] = render(['a']);
  expect(first).toEqual(['a']);
  setDraft((current) => [...current, 'pending b']);

  // A refresh that builds a new array with the same rows keeps the local draft.
  expect(render(['a'])[0]).toEqual(['a', 'pending b']);
  expect(seeds).toEqual([null]);

  // New server rows reseed during render from the current draft; React renders again at once.
  render(['a', 'c']);
  expect(render(['a', 'c'])[0]).toEqual(['a', 'c', 'pending b']);
  expect(seeds).toEqual([null, ['a', 'pending b']]);
});

test('a map access write holds its key while saving, keeps a failure, and applies before refreshing once saved', async () => {
  rt.unmount();
  h.updateMapAccess.mockReset();
  h.refresh.mockReset();
  const render = () => rt.render(useMapAccessWrite<string>);
  const request = { operation: 'block', mapId: 'map-a', characterId: 7 } as const;
  const applied = vi.fn();

  let failed!: (outcome: unknown) => void;
  h.updateMapAccess.mockReturnValueOnce(new Promise((resolve) => { failed = resolve; }));
  const failing = render().run('pilot', request, applied);
  expect(h.updateMapAccess).toHaveBeenCalledExactlyOnceWith(request);
  expect(render()).toMatchObject({ busy: 'pilot', error: null });
  failed({ ok: false, kind: 'api', status: 409 });
  await failing;
  expect(render()).toMatchObject({ busy: null, error: 'failed with 409' });
  expect(applied).not.toHaveBeenCalled();
  expect(h.refresh).not.toHaveBeenCalled();

  const order: string[] = [];
  applied.mockImplementation(() => order.push('apply'));
  h.refresh.mockImplementation(() => order.push('refresh'));
  let saved!: (outcome: unknown) => void;
  h.updateMapAccess.mockReturnValueOnce(new Promise((resolve) => { saved = resolve; }));
  const saving = render().run('other pilot', request, applied);
  // A new write clears the last failure while it saves.
  expect(render()).toMatchObject({ busy: 'other pilot', error: null });
  saved({ ok: true });
  await saving;
  expect(render()).toMatchObject({ busy: null, error: null });
  expect(order).toEqual(['apply', 'refresh']);

  h.updateMapAccess.mockResolvedValueOnce({ ok: false, kind: 'api', status: 503 });
  await render().run('pilot', request, applied);
  expect(render().error).toBe('failed with 503');
  render().clearError();
  expect(render().error).toBeNull();
});
