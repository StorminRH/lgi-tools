import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn(), success: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: (...args: unknown[]) => h.success(...args) },
}));

import { signatureEliminationEndpoint } from '@/data/maps/api-contract';
import {
  eliminateSignaturesAndAnnounce,
  followUpElimination,
  invalidateSignatureElimination,
} from './signature-elimination-client';

const SYSTEM = 31_000_001;
const MAP = 'map-1';

function applied(signatureIds: string[]) {
  return {
    ok: true as const,
    data: {
      results: [{
        status: 'applied' as const,
        systemId: SYSTEM,
        signatureIds,
      }],
    },
  };
}

function quiet() {
  return {
    ok: true as const,
    data: { results: [{ status: 'quiet' as const, systemId: SYSTEM }] },
  };
}

beforeEach(() => {
  h.apiFetch.mockReset();
  h.success.mockReset();
  invalidateSignatureElimination(MAP, SYSTEM);
});

it('announces applied identifications and stays quiet on quiet/failed transport', async () => {
  h.apiFetch.mockResolvedValueOnce(applied(['LXX-844']));
  await expect(
    eliminateSignaturesAndAnnounce({ mapId: MAP, systemIds: [SYSTEM] }),
  ).resolves.toEqual(applied(['LXX-844']).data);
  expect(h.apiFetch).toHaveBeenCalledWith(
    signatureEliminationEndpoint,
    expect.objectContaining({
      body: { mapId: MAP, systemIds: [SYSTEM] },
      signal: expect.anything(),
    }),
  );
  expect(h.success).toHaveBeenCalledWith(
    'LXX-844 has been identified.',
    { id: 'signature-elimination:map-1:31000001' },
  );

  h.apiFetch.mockResolvedValueOnce(applied(['AAA-111', 'BBB-222']));
  await eliminateSignaturesAndAnnounce({ mapId: MAP, systemIds: [SYSTEM] });
  expect(h.success).toHaveBeenCalledWith(
    'AAA-111 and BBB-222 have been identified.',
    { id: 'signature-elimination:map-1:31000001' },
  );

  h.apiFetch.mockResolvedValueOnce(quiet());
  await eliminateSignaturesAndAnnounce({ mapId: MAP, systemIds: [SYSTEM] });
  expect(h.success).toHaveBeenCalledTimes(2);

  h.apiFetch.mockResolvedValueOnce({ ok: false });
  await expect(
    eliminateSignaturesAndAnnounce({ mapId: MAP, systemIds: [SYSTEM] }),
  ).resolves.toBeNull();
  expect(h.success).toHaveBeenCalledTimes(2);
});

it('skips idle follow-up after a successful reconcile and retries after a failed one', async () => {
  const digest = 'idle-scan';
  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'idle' },
    digest,
  });
  expect(h.apiFetch).toHaveBeenCalledOnce();

  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'idle' },
    digest,
  });
  expect(h.apiFetch).toHaveBeenCalledOnce();

  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'mutated' },
    digest,
  });
  expect(h.apiFetch).toHaveBeenCalledTimes(2);

  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'claimed' },
    digest,
  });
  expect(h.apiFetch).toHaveBeenCalledTimes(3);

  h.apiFetch.mockResolvedValueOnce({ ok: false });
  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'mutated' },
    digest,
  });
  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination({
    mapId: MAP,
    systemId: SYSTEM,
    write: { kind: 'idle' },
    digest,
  });
  expect(h.apiFetch).toHaveBeenCalledTimes(5);
});

it('retries an identical idle paste after observation persistence fails', async () => {
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  h.apiFetch.mockResolvedValueOnce({
    ok: true,
    data: { results: [{ systemId: SYSTEM, status: 'observations-unavailable' }] },
  }).mockResolvedValueOnce(quiet());
  await followUpElimination(input);
  await followUpElimination(input);
  await followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

it('shares overlapping identical idle follow-ups and announces the result once', async () => {
  const response = Promise.withResolvers<ReturnType<typeof applied>>();
  h.apiFetch.mockReturnValueOnce(response.promise);
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  const first = followUpElimination(input);
  const second = followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledOnce();

  const result = applied(['A']);
  response.resolve(result);
  await expect(Promise.all([first, second])).resolves.toEqual([result.data, result.data]);
  expect(h.success).toHaveBeenCalledOnce();
  await expect(followUpElimination(input)).resolves.toBeNull();
  expect(h.apiFetch).toHaveBeenCalledOnce();
});

it('retries after overlapping idle follow-ups share a failed transport result', async () => {
  const response = Promise.withResolvers<{ ok: false }>();
  h.apiFetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce(quiet());
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  const first = followUpElimination(input);
  const second = followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledOnce();

  response.resolve({ ok: false });
  await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
  await expect(followUpElimination(input)).resolves.toEqual(quiet().data);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(h.success).not.toHaveBeenCalled();
});

it('retries after overlapping idle follow-ups share a rejected request', async () => {
  const response = Promise.withResolvers<ReturnType<typeof quiet>>();
  h.apiFetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce(quiet());
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  const first = followUpElimination(input);
  const second = followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledOnce();

  const error = new Error('Request rejected');
  const outcomes = Promise.allSettled([first, second]);
  response.reject(error);
  await expect(outcomes).resolves.toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  await expect(followUpElimination(input)).resolves.toEqual(quiet().data);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

it('reruns an identical paste after its evidence is invalidated by removal or restore', async () => {
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  h.apiFetch.mockResolvedValueOnce(quiet()).mockResolvedValueOnce(applied(['A']));
  await followUpElimination(input);
  invalidateSignatureElimination(MAP, SYSTEM);
  await followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
  expect(h.success).toHaveBeenCalledWith('A has been identified.', expect.anything());
});

it('does not restore an invalidated cache entry when an older request completes', async () => {
  const response = Promise.withResolvers<ReturnType<typeof quiet>>();
  h.apiFetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce(quiet());
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  const pending = followUpElimination(input);
  invalidateSignatureElimination(MAP, SYSTEM);
  response.resolve(quiet());
  await pending;
  await followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledTimes(2);
});

it.each(['mutated', 'claimed'] as const)('ignores an older success after a newer %s follow-up fails', async (kind) => {
  const response = Promise.withResolvers<ReturnType<typeof quiet>>();
  h.apiFetch.mockReturnValueOnce(response.promise).mockResolvedValueOnce({ ok: false });
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  const pending = followUpElimination(input);
  await followUpElimination({ ...input, write: { kind } });
  response.resolve(quiet());
  await pending;
  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});

it('invalidates prior paste success when a direct authoring follow-up fails', async () => {
  const input = { mapId: MAP, systemId: SYSTEM, write: { kind: 'idle' as const }, digest: 'A' };
  h.apiFetch.mockResolvedValueOnce(quiet()).mockResolvedValueOnce({ ok: false });
  await followUpElimination(input);
  await eliminateSignaturesAndAnnounce({ mapId: MAP, systemIds: [SYSTEM] });
  h.apiFetch.mockResolvedValueOnce(quiet());
  await followUpElimination(input);
  expect(h.apiFetch).toHaveBeenCalledTimes(3);
});
