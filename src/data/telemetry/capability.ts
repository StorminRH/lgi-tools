// The closed catalogue of instrumented units of work, plus the single function
// that records one completed unit's outcome.
//
// This is a sibling of `queries.ts`, not an addition to it: that file sits one
// export below the AF-006 Watch trigger, so new telemetry surface lands here and
// writes through the existing `emitCostMetric` seam, which already schedules via
// `after()` and already swallows its own failures. No capability write is ever
// awaited on a request path, and `usage_logs` remains the only telemetry table.
//
// Outcome vocabulary is borrowed, never invented: `outcome` is a `FailureCategory`
// from the 3.10.2.1 taxonomy plus the literal `succeeded`, and `code` is the
// `AppFailure` code. `feature` and `operation` are the only grouping labels and
// both are closed; `correlationId`, the durations, and the dependency map are
// recorded as values and must never be grouped on.
import { APP_VERSION } from '@/config/app-version';
import type { DependencyKind, DependencyTiming } from '@/lib/dependency-timing';
import { FAILURE_CATEGORIES, isAppFailure, type FailureCategory } from '@/lib/failure';
import { CATEGORY_STATUS } from '@/lib/problem';
import {
  currentCorrelationId,
  currentDependencyTimings,
  currentStashedFailure,
} from '@/transport/correlation';
import { emitCostMetric } from './cost-metrics';

/** Closed product areas an instrumented operation can belong to. */
export const CAPABILITY_FEATURES = [
  'account',
  'admin',
  'planner',
  'structures',
  'market',
  'maps',
  'sync',
  'cron',
  'feedback',
] as const;

/** Closed product area owning one instrumented operation. */
export type CapabilityFeature = (typeof CAPABILITY_FEATURES)[number];

/**
 * What sort of work an operation is. The service indicators select their populations from this
 * rather than restating operation lists: a mutation changes state, a read answers a POST-bodied
 * query, a cron is a scheduled batch, and a job is queued background work.
 */
export type CapabilityKind = 'mutation' | 'read' | 'cron' | 'job';

/**
 * Closed catalogue of the 43 instrumented operations: 20 mutation routes through `runMutationRoute`,
 * 8 cron routes through `defineCronRoute`, 8 direct mutation routes that deliberately sit outside
 * the mutation shell, 6 POST-bodied tool reads, and the queued ESI-refresh job runner. Adding a
 * route, cron, or job means adding its entry here; the shells take a `CapabilityId` and the route
 * census covers the rest, so an operation cannot ship unnamed.
 */
export const CAPABILITIES = {
  // ── Mutation routes through `runMutationRoute` (20) ────────────────────
  'account.switch-active-character': { feature: 'account', operation: 'switch-active-character', kind: 'mutation' },
  'account.unlink-character': { feature: 'account', operation: 'unlink-character', kind: 'mutation' },
  'account.purge-character': { feature: 'account', operation: 'purge-character', kind: 'mutation' },
  'account.revoke-own-sessions': { feature: 'account', operation: 'revoke-own-sessions', kind: 'mutation' },
  'account.save-preferences': { feature: 'account', operation: 'save-preferences', kind: 'mutation' },
  'structures.set-corp-structure-rigs': {
    feature: 'structures',
    operation: 'set-corp-structure-rigs',
    kind: 'mutation',
  },
  'structures.set-corp-structure-sharing': {
    feature: 'structures',
    operation: 'set-corp-structure-sharing',
    kind: 'mutation',
  },
  'structures.create-custom-structure': {
    feature: 'structures',
    operation: 'create-custom-structure',
    kind: 'mutation',
  },
  'structures.delete-custom-structure': {
    feature: 'structures',
    operation: 'delete-custom-structure',
    kind: 'mutation',
  },
  'structures.set-custom-structure-pin': {
    feature: 'structures',
    operation: 'set-custom-structure-pin',
    kind: 'mutation',
  },
  'structures.set-custom-structure-tax': {
    feature: 'structures',
    operation: 'set-custom-structure-tax',
    kind: 'mutation',
  },
  'planner.create-saved-plan': { feature: 'planner', operation: 'create-saved-plan', kind: 'mutation' },
  'planner.delete-saved-plan': { feature: 'planner', operation: 'delete-saved-plan', kind: 'mutation' },
  'planner.rename-saved-plan': { feature: 'planner', operation: 'rename-saved-plan', kind: 'mutation' },
  'planner.favorite-saved-plan': { feature: 'planner', operation: 'favorite-saved-plan', kind: 'mutation' },
  'maps.create-map': { feature: 'maps', operation: 'create-map', kind: 'mutation' },
  'maps.eliminate-signatures': { feature: 'maps', operation: 'eliminate-signatures', kind: 'mutation' },
  'maps.resolve-jump': { feature: 'maps', operation: 'resolve-jump', kind: 'mutation' },
  'admin.unlink-character': { feature: 'admin', operation: 'unlink-character', kind: 'mutation' },
  'admin.revoke-user-sessions': { feature: 'admin', operation: 'revoke-user-sessions', kind: 'mutation' },

  // ── Cron routes through `defineCronRoute` (8) ──────────────────────────
  'cron.drain-esi-refresh-jobs': { feature: 'cron', operation: 'drain-esi-refresh-jobs', kind: 'cron' },
  'cron.refresh-affiliations': { feature: 'cron', operation: 'refresh-affiliations', kind: 'cron' },
  'cron.refresh-gsc': { feature: 'cron', operation: 'refresh-gsc', kind: 'cron' },
  'cron.refresh-industry-indices': { feature: 'cron', operation: 'refresh-industry-indices', kind: 'cron' },
  'cron.refresh-prices': { feature: 'cron', operation: 'refresh-prices', kind: 'cron' },
  'cron.refresh-sde': { feature: 'cron', operation: 'refresh-sde', kind: 'cron' },
  'cron.refresh-wh-statics': { feature: 'cron', operation: 'refresh-wh-statics', kind: 'cron' },
  'cron.sync-sweeper': { feature: 'cron', operation: 'sync-sweeper', kind: 'cron' },

  // ── Direct mutation routes outside the mutation shell (8) ──────────────
  'account.delete-account': { feature: 'account', operation: 'delete-account', kind: 'mutation' },
  'admin.reassign-character': { feature: 'admin', operation: 'reassign-character', kind: 'mutation' },
  'admin.requeue-esi-job': { feature: 'admin', operation: 'requeue-esi-job', kind: 'mutation' },
  'admin.set-user-role': { feature: 'admin', operation: 'set-user-role', kind: 'mutation' },
  'admin.wh-statics-review': { feature: 'admin', operation: 'wh-statics-review', kind: 'mutation' },
  'market.refresh-market-prices': { feature: 'market', operation: 'refresh-market-prices', kind: 'mutation' },
  'market.refresh-market-history': { feature: 'market', operation: 'refresh-market-history', kind: 'mutation' },
  'feedback.submit-feedback': { feature: 'feedback', operation: 'submit-feedback', kind: 'mutation' },

  // ── POST-bodied tool reads (6) ─────────────────────────────────────────
  'planner.resolve-entity-names': { feature: 'planner', operation: 'resolve-entity-names', kind: 'read' },
  'planner.resolve-build-location': { feature: 'planner', operation: 'resolve-build-location', kind: 'read' },
  'planner.read-owned-assets': { feature: 'planner', operation: 'read-owned-assets', kind: 'read' },
  'planner.read-owned-blueprints': { feature: 'planner', operation: 'read-owned-blueprints', kind: 'read' },
  'planner.read-skill-levels': { feature: 'planner', operation: 'read-skill-levels', kind: 'read' },
  'structures.parse-structure-fit': { feature: 'structures', operation: 'parse-structure-fit', kind: 'read' },

  // ── Queued work (1) ────────────────────────────────────────────────────
  'sync.process-esi-refresh-job': { feature: 'sync', operation: 'process-esi-refresh-job', kind: 'job' },
} as const satisfies Record<
  string,
  { feature: CapabilityFeature; operation: string; kind: CapabilityKind }
>;

/** One instrumented operation's identity, used as the shells' required option. */
export type CapabilityId = keyof typeof CAPABILITIES;

/** Operations whose durations the service indicators read as user-facing waits. */
export const USER_FACING_CAPABILITY_KINDS = ['mutation', 'read'] as const;

/** Returns the operation names of every capability of the given kinds. */
export function operationsOfKind(
  ...kinds: readonly CapabilityKind[]
): CapabilityOperation[] {
  return Object.values(CAPABILITIES)
    .filter((capability) => kinds.includes(capability.kind))
    .map((capability) => capability.operation);
}

/** Closed operation vocabulary derived from the catalogue; never an open string. */
export type CapabilityOperation = (typeof CAPABILITIES)[CapabilityId]['operation'];

/** Outcome of one completed operation: a stable failure category, or success. */
export type CapabilityOutcome = FailureCategory | 'succeeded';

/** Retry and rate-limit result for an operation the platform may re-run. */
export interface CapabilityRetry {
  attempt: number;
  maxAttempts: number;
  rateLimited: boolean;
}

/**
 * One completed operation's durable record. `outcome` is a FailureCategory or 'succeeded' and
 * `code` is the AppFailure code, both from the 3.10.2.1 taxonomy — never a second vocabulary.
 * `correlationId` and the duration fields are values, never grouping labels.
 */
export interface CapabilityOutcomeRecord {
  feature: CapabilityFeature;
  operation: CapabilityOperation;
  outcome: CapabilityOutcome;
  code: string;
  durationMs: number;
  dependencies: Partial<Record<DependencyKind, DependencyTiming>>;
  retry: CapabilityRetry | null;
  correlationId: string;
  appVersion: string;
}

/** The result half of a capability record; the catalogue and ambient scope supply the rest. */
export type CapabilityOutcomeInput = Pick<
  CapabilityOutcomeRecord,
  'outcome' | 'code' | 'durationMs' | 'retry'
>;

/**
 * Builds the durable record for one completed operation, reading the ambient correlation id and
 * accumulated dependency durations.
 */
function buildCapabilityRecord(
  id: CapabilityId,
  outcome: CapabilityOutcomeInput,
): CapabilityOutcomeRecord {
  const capability = CAPABILITIES[id];
  return {
    feature: capability.feature,
    operation: capability.operation,
    outcome: outcome.outcome,
    code: outcome.code,
    durationMs: outcome.durationMs,
    dependencies: { ...currentDependencyTimings() },
    retry: outcome.retry,
    correlationId: currentCorrelationId(),
    appVersion: APP_VERSION,
  };
}

/**
 * Schedules one capability record after the response through the shared cost-metric emitter.
 * The record is materialized synchronously so it captures the operation's ambient scope, which
 * the scheduled callback runs outside of. Never awaited on a request path and never throws.
 */
export function recordCapabilityOutcome(
  id: CapabilityId,
  outcome: CapabilityOutcomeInput,
): void {
  emitCostMetric('capability_outcome', { ...buildCapabilityRecord(id, outcome) });
}

/** The outcome half of a record: what happened, expressed in the borrowed taxonomy. */
export type CapabilityResult = Pick<CapabilityOutcomeRecord, 'outcome' | 'code'>;

function categoryForStatus(status: number): FailureCategory {
  const matched = FAILURE_CATEGORIES.find(
    (category) => CATEGORY_STATUS[category] === status,
  );
  // 502 is the one status a category reaches only through an explicit override.
  if (matched === undefined) return status === 502 ? 'dependency_unavailable' : 'unexpected';
  return matched;
}

/**
 * Derives what an operation actually served. The scope's failure stash is authoritative because the
 * stable code cannot be recovered from the response: `CATEGORY_STATUS` maps a category to a status
 * only, so a 409 alone recovers `'conflict'` but never `'template_limit'`. Status mapping remains
 * the fallback for a response built outside any scope.
 */
export function capabilityResultForResponse(response: Response): CapabilityResult {
  const stashed = currentStashedFailure();
  if (stashed !== null) return { outcome: stashed.category, code: stashed.code };
  if (response.status < 400) return { outcome: 'succeeded', code: 'ok' };
  const category = categoryForStatus(response.status);
  return { outcome: category, code: category };
}

/** Derives the recorded outcome for an operation that threw before it could serve a response. */
export function capabilityResultForError(error: unknown): CapabilityResult {
  if (isAppFailure(error)) return { outcome: error.category, code: error.code };
  return { outcome: 'unexpected', code: 'unexpected' };
}
