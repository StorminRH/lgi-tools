import { describe, expect, it, vi } from 'vitest';
import {
  clearStandingPreviewExpirations,
  resolveNeonBranchPolicy,
  standingPreviewNeedsExpirationClear,
} from '../../neon';

describe('resolveNeonBranchPolicy', () => {
  it('protects the default production branch', () => {
    expect(resolveNeonBranchPolicy({ name: 'main', isDefault: true, exists: true })).toEqual({
      protected: true,
      postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 2 } },
    });
  });

  it('leaves staging up with cheap compute and no TTL', () => {
    expect(resolveNeonBranchPolicy({ name: 'staging', isDefault: false, exists: true })).toEqual({
      postgres: {
        computeSettings: {
          autoscalingLimitMinCu: 0.25,
          autoscalingLimitMaxCu: 1,
          suspendTimeout: '5m',
        },
      },
    });
  });

  it('treats preview/staging the same as staging', () => {
    expect(resolveNeonBranchPolicy({ name: 'preview/staging', isDefault: false, exists: false })).toEqual(
      resolveNeonBranchPolicy({ name: 'staging', isDefault: false, exists: true }),
    );
  });

  it('gives preview/development a three-day TTL', () => {
    expect(
      resolveNeonBranchPolicy({ name: 'preview/development', isDefault: false, exists: false }),
    ).toMatchObject({ ttl: '3d' });
  });

  it('leaves other existing branches untouched', () => {
    expect(resolveNeonBranchPolicy({ name: 'scratch', isDefault: false, exists: true })).toEqual({});
  });
});

describe('standingPreviewNeedsExpirationClear', () => {
  it('is true only for standing preview names that still expire', () => {
    expect(
      standingPreviewNeedsExpirationClear({
        name: 'staging',
        expiresAt: '2026-09-01T00:00:00Z',
      }),
    ).toBe(true);
    expect(
      standingPreviewNeedsExpirationClear({
        name: 'preview/staging',
        expiresAt: '2026-09-01T00:00:00Z',
      }),
    ).toBe(true);
  });

  it('is false when the standing preview has no expiration', () => {
    expect(standingPreviewNeedsExpirationClear({ name: 'staging', expiresAt: null })).toBe(false);
    expect(standingPreviewNeedsExpirationClear({ name: 'preview/development', expiresAt: '2026-09-01T00:00:00Z' })).toBe(
      false,
    );
  });
});

describe('clearStandingPreviewExpirations', () => {
  it('PATCHes only standing previews that still expire', async () => {
    const updateExpiration = vi.fn(async () => undefined);
    const cleared = await clearStandingPreviewExpirations(
      [
        { id: 'br-staging', name: 'staging', expiresAt: '2026-09-01T00:00:00Z' },
        { id: 'br-preview-staging', name: 'preview/staging', expiresAt: null },
        { id: 'br-dev', name: 'preview/development', expiresAt: '2026-08-23T00:00:00Z' },
      ],
      updateExpiration,
    );

    expect(cleared).toEqual(['staging']);
    expect(updateExpiration).toHaveBeenCalledOnce();
    expect(updateExpiration).toHaveBeenCalledWith('br-staging');
  });
});
