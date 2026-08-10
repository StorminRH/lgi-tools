import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  deriveConvexSiteUrl: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => h.fetchWithTimeout(...args),
}));
vi.mock('@/lib/sync-engine', () => ({
  deriveConvexSiteUrl: (...args: unknown[]) => h.deriveConvexSiteUrl(...args),
}));
vi.mock('@/lib/env', () => ({
  readEnv: (...args: unknown[]) => h.readEnv(...args),
}));

import {
  applyEliminationDeductions,
  EliminationConvexUnavailableError,
  readEliminationEvidence,
} from './convex-door';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  h.fetchWithTimeout.mockReset();
  h.deriveConvexSiteUrl.mockReset().mockReturnValue('https://example.convex.site');
  h.readEnv.mockReset().mockReturnValue('service-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('signature elimination Convex door', () => {
  it('posts evidence and one deduction batch through the bearer-gated endpoint', async () => {
    h.fetchWithTimeout
      .mockResolvedValueOnce(Response.json({
        canEdit: true,
        signatures: [],
        connections: [],
      }))
      .mockResolvedValueOnce(Response.json([
        { signatureId: 'AAA-111', outcome: 'applied', observationKey: 'key-1' },
      ]));

    await expect(
      readEliminationEvidence('user-1', 'map-1', 31_000_001),
    ).resolves.toMatchObject({ canEdit: true });
    await expect(applyEliminationDeductions({
      userId: 'user-1',
      mapId: 'map-1',
      systemId: 31_000_001,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    })).resolves.toEqual([
      { signatureId: 'AAA-111', outcome: 'applied', observationKey: 'key-1' },
    ]);

    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://example.convex.site/signature-elimination',
      expect.objectContaining({
        body: JSON.stringify({
          operation: 'evidence',
          userId: 'user-1',
          mapId: 'map-1',
          systemId: 31_000_001,
        }),
      }),
    );
    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://example.convex.site/signature-elimination',
      expect.objectContaining({
        body: expect.stringContaining('"operation":"apply"'),
      }),
    );
  });

  it('fails closed on missing configuration or an invalid response contract', async () => {
    h.readEnv.mockReturnValueOnce(undefined);
    await expect(
      readEliminationEvidence('user-1', 'map-1', 31_000_001),
    ).rejects.toBeInstanceOf(EliminationConvexUnavailableError);

    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ canEdit: 'yes' }));
    await expect(
      readEliminationEvidence('user-1', 'map-1', 31_000_001),
    ).rejects.toBeInstanceOf(EliminationConvexUnavailableError);
  });
});
