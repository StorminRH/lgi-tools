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
  const digest = `idle:${Date.now()}`;
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
