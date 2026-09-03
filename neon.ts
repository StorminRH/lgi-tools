// `neon config apply` alone cannot clear an existing `expiresAt`.
// Reconcile with `pnpm neon:apply` (`neon config apply` plus a PATCH).
// Nothing auto-applies it. Branch policy only: no services are declared.
// Absence of a service leaves any existing one untouched (absence never disables).
import { defineConfig, type BranchTarget, type BranchTuning } from '@neondatabase/config/v1';

const STANDING_PREVIEW_NAMES = new Set(['staging', 'preview/staging']);

const PREVIEW_COMPUTE = {
  postgres: {
    computeSettings: {
      autoscalingLimitMinCu: 0.25,
      autoscalingLimitMaxCu: 1,
      // Launch cannot set 1m; 5m is the plan default and the shortest custom value.
      suspendTimeout: '5m',
    },
  },
} as const;

const PRODUCTION_POLICY = {
  protected: true,
  postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 2 } },
} as const;

const STAGING_POLICY = { ...PREVIEW_COMPUTE } as const;

const EPHEMERAL_PREVIEW_POLICY = {
  ttl: '3d',
  ...PREVIEW_COMPUTE,
} as const;

export function resolveNeonBranchPolicy(branch: BranchTarget): BranchTuning {
  if (branch.isDefault) return PRODUCTION_POLICY;
  if (STANDING_PREVIEW_NAMES.has(branch.name)) return STAGING_POLICY;
  if (branch.name.startsWith('preview/')) return EPHEMERAL_PREVIEW_POLICY;
  return {};
}

export function standingPreviewNeedsExpirationClear(branch: {
  name: string;
  expiresAt: string | null | undefined;
}): boolean {
  return STANDING_PREVIEW_NAMES.has(branch.name) && branch.expiresAt != null && branch.expiresAt !== '';
}

/**
 * Clears expiration on every standing preview that still has one.
 * `updateExpiration` owns the Neon PATCH; this only chooses which branches.
 */
export async function clearStandingPreviewExpirations(
  branches: readonly {
    id: string;
    name: string;
    expiresAt: string | null | undefined;
  }[],
  updateExpiration: (branchId: string) => Promise<void>,
): Promise<string[]> {
  const cleared: string[] = [];
  for (const branch of branches) {
    if (!standingPreviewNeedsExpirationClear(branch)) continue;
    await updateExpiration(branch.id);
    cleared.push(branch.name);
  }
  return cleared;
}

export default defineConfig({
  branch: resolveNeonBranchPolicy,
});
