// Committed Neon branch-configuration policy (Config-as-Code). The database's
// desired branch state lives here in the repo — the same committed-config
// discipline the rest of the stack has — dry-run with `neon config plan` and
// reconciled with `neon config apply`. Nothing auto-applies it (no CI hook);
// it takes effect only when someone runs the CLI against a branch.
//
// Branch policy ONLY: no services are declared (no `auth`/`dataApi`/`preview`).
// Identity is Better Auth, and storage/AI are self-hosted, so the Neon service
// integrations stay out of this file. Absence of a service leaves any existing
// one untouched (absence never disables), so this stays a pure branch policy.
//
// Names:
//   default (`main`)  — Production. Protected. Current live compute.
//   `staging`         — long-lived Preview DB. No TTL. Cheap, sleeps in 5m.
//   `development`     — long-lived Preview DB. Same cheap compute, no TTL.
//   `preview/*`       — leftover webhook names only. 3-day TTL if one appears.
import { defineConfig } from '@neondatabase/config/v1';

const STANDING_PREVIEW_NAMES = new Set(['staging', 'development']);

const STANDING_PREVIEW_COMPUTE = {
  postgres: {
    computeSettings: {
      autoscalingLimitMinCu: 0.25,
      autoscalingLimitMaxCu: 1,
      // Launch cannot set 1m; 5m is the plan default and the shortest custom value.
      suspendTimeout: '5m',
    },
  },
} as const;

export default defineConfig({
  branch: (branch) => {
    if (branch.isDefault) {
      return {
        protected: true,
        postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 2 } },
      };
    }
    if (STANDING_PREVIEW_NAMES.has(branch.name)) {
      return { ...STANDING_PREVIEW_COMPUTE };
    }
    if (branch.name.startsWith('preview/')) {
      return {
        ttl: '3d',
        ...STANDING_PREVIEW_COMPUTE,
      };
    }
    if (branch.exists) return {};
    return {};
  },
});
