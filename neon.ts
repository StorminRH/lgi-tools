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
import { defineConfig } from '@neondatabase/config/v1';

export default defineConfig({
  branch: (branch) => {
    // Production (Neon's default branch): protect it from accidental deletion,
    // and pin compute to today's live values so this file — not the dashboard —
    // is where prod is resized (edit here, then `neon config apply`).
    if (branch.isDefault) {
      return {
        protected: true,
        postgres: { computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 2 } },
      };
    }
    // Any non-default branch that already exists on Neon: leave its live,
    // possibly in-use settings alone.
    if (branch.exists) return {};
    // A brand-new preview branch: apply the cost guard — auto-expire a few days
    // out so an abandoned preview cleans itself up, on cheap compute that scales
    // to zero quickly when idle. Gated on the `preview/<branch>` naming the
    // manual-preview flow uses (see the delete-neon-branch workflow), so the TTL
    // only ever reaches ephemeral previews.
    if (branch.name.startsWith('preview/')) {
      return {
        ttl: '3d',
        postgres: {
          computeSettings: { autoscalingLimitMinCu: 0.25, autoscalingLimitMaxCu: 1, suspendTimeout: '1m' },
        },
      };
    }
    // Any other new non-default branch (e.g. a future long-lived `staging`):
    // no TTL — it must not silently auto-expire — and inherit project defaults.
    return {};
  },
});
