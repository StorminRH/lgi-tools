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
  answerJump,
  authorJump,
  JumpConvexUnavailableError,
  readConnectionEvidence,
  readTransitionEvidence,
} from './convex-door';

const emission = {
  connectionId: 'connection-1',
  fromSystemId: 31_000_001,
  toSystemId: 31_000_002,
  wormholeTypeCode: 'C247',
  typedSide: 'from',
  typedSideSystemId: 31_000_001,
  typeProvenance: 'human',
  destinationProvenance: 'jump-verified',
  observationKey: 'observation-key',
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
  h.fetchWithTimeout.mockReset();
  h.deriveConvexSiteUrl.mockReset().mockReturnValue('https://example.convex.site');
  h.readEnv.mockReset().mockReturnValue('service-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('jump resolver Convex doors', () => {
  it('posts transition and connection reads through the one evidence door', async () => {
    h.fetchWithTimeout
      .mockResolvedValueOnce(Response.json({
        canEdit: true,
        tracked: true,
        transition: {
          fromSolarSystemId: 31_000_001,
          toSolarSystemId: 31_000_002,
          shipTypeId: 587,
          prevFresh: true,
          transitionObservedAt: 1_800_000_000_000,
        },
        lastProcessedTransitionAt: null,
        originLive: true,
        candidates: [],
      }))
      .mockResolvedValueOnce(Response.json({
        canEdit: true,
        connection: emission,
      }));

    await expect(
      readTransitionEvidence('user-1', 'map-1', 90_000_001),
    ).resolves.toMatchObject({ tracked: true });
    await expect(
      readConnectionEvidence('user-1', 'map-1', 'connection-1'),
    ).resolves.toMatchObject({ connection: emission });

    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://example.convex.site/jump-evidence',
      expect.objectContaining({
        body: JSON.stringify({
          mode: 'transition',
          userId: 'user-1',
          mapId: 'map-1',
          characterId: 90_000_001,
        }),
      }),
    );
    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://example.convex.site/jump-evidence',
      expect.objectContaining({
        body: JSON.stringify({
          mode: 'connection',
          userId: 'user-1',
          mapId: 'map-1',
          connectionId: 'connection-1',
        }),
      }),
    );
  });

  it('posts authoring and answers through the one resolve door', async () => {
    h.fetchWithTimeout
      .mockResolvedValueOnce(Response.json({ status: 'authored', emission }))
      .mockResolvedValueOnce(Response.json(emission));
    await expect(
      authorJump({
        userId: 'user-1',
        mapId: 'map-1',
        characterId: 90_000_001,
        fromSolarSystemId: 31_000_001,
        toSolarSystemId: 31_000_002,
        transitionObservedAt: 1_800_000_000_000,
        observedShipMassKg: 12_000_000,
        observationKey: 'observation-key',
        decision: { kind: 'insert', candidateIds: [], survivors: [] },
      }),
    ).resolves.toMatchObject({ status: 'authored' });
    await expect(
      answerJump({
        operation: 'confirm',
        userId: 'user-1',
        mapId: 'map-1',
        connectionId: 'connection-1',
      }),
    ).resolves.toMatchObject({ connectionId: 'connection-1' });
    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://example.convex.site/resolve-jump',
      expect.any(Object),
    );
    expect(h.fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://example.convex.site/resolve-jump',
      expect.any(Object),
    );
  });

  it('fails closed when configuration, transport, status, or response contract is invalid', async () => {
    h.readEnv.mockReturnValueOnce(undefined);
    await expect(
      readTransitionEvidence('user-1', 'map-1', 90_000_001),
    ).rejects.toBeInstanceOf(JumpConvexUnavailableError);

    h.fetchWithTimeout.mockRejectedValueOnce(new Error('down'));
    await expect(
      readTransitionEvidence('user-1', 'map-1', 90_000_001),
    ).rejects.toBeInstanceOf(JumpConvexUnavailableError);

    h.fetchWithTimeout.mockResolvedValueOnce(new Response('no', { status: 503 }));
    await expect(
      readTransitionEvidence('user-1', 'map-1', 90_000_001),
    ).rejects.toBeInstanceOf(JumpConvexUnavailableError);

    h.fetchWithTimeout.mockResolvedValueOnce(Response.json({ tracked: 'yes' }));
    await expect(
      readTransitionEvidence('user-1', 'map-1', 90_000_001),
    ).rejects.toBeInstanceOf(JumpConvexUnavailableError);
  });
});
