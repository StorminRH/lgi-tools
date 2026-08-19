import { describe, expect, it } from 'vitest';
import { resolveNeonBranchPolicy } from '../../neon';

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
