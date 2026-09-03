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

/** Closed product area owning one instrumented operation. */
export type CapabilityFeature =
  | 'account'
  | 'admin'
  | 'planner'
  | 'structures'
  | 'market'
  | 'maps'
  | 'sync'
  | 'cron'
  | 'feedback';

/**
 * What sort of work an operation is. The service indicators select their populations from this
 * rather than restating operation lists: a mutation changes state, a read answers a POST-bodied
 * query, a cron is a scheduled batch, and a job is queued background work.
 */
export type CapabilityKind = 'mutation' | 'read' | 'cron' | 'job';

type CapabilitySpec = {
  readonly [F in CapabilityFeature]?: {
    readonly [K in CapabilityKind]?: readonly string[];
  };
};

type CatalogueFromSpec<TSpec extends CapabilitySpec> = {
  [F in keyof TSpec & CapabilityFeature]: {
    [K in keyof TSpec[F] & CapabilityKind]: TSpec[F][K] extends readonly (infer O extends string)[]
      ? { [Op in O as `${F}.${Op}`]: { feature: F; operation: Op; kind: K } }
      : never;
  }[keyof TSpec[F] & CapabilityKind];
}[keyof TSpec & CapabilityFeature];

function catalogueFromSpec<const TSpec extends CapabilitySpec>(spec: TSpec) {
  const entries: [string, { feature: CapabilityFeature; operation: string; kind: CapabilityKind }][] =
    [];
  for (const [feature, kinds] of Object.entries(spec) as [
    CapabilityFeature,
    NonNullable<CapabilitySpec[CapabilityFeature]>,
  ][]) {
    for (const [kind, operations] of Object.entries(kinds) as [CapabilityKind, readonly string[]][]) {
      for (const operation of operations) {
        entries.push([`${feature}.${operation}`, { feature, operation, kind }]);
      }
    }
  }
  return Object.fromEntries(entries) as {
    [E in CatalogueFromSpec<TSpec> as keyof E]: E[keyof E];
  };
}

/**
 * Closed catalogue of the 50 instrumented operations: 25 mutations and one authenticated read
 * through `runMutationRoute`, 9 cron routes through `defineCronRoute`, 8 direct mutation routes
 * that deliberately sit outside the mutation shell, 6 other POST-bodied tool reads, and the
 * queued ESI-refresh job runner. Adding a
 * route, cron, or job means adding its entry here; the shells take a `CapabilityId` and the route
 * census covers the rest, so an operation cannot ship unnamed.
 */
export const CAPABILITIES = catalogueFromSpec({
  account: { mutation: ['switch-active-character', 'unlink-character', 'purge-character', 'revoke-own-sessions', 'save-preferences', 'delete-account'] },
  structures: { mutation: ['set-corp-structure-rigs', 'set-corp-structure-sharing', 'create-custom-structure', 'delete-custom-structure', 'set-custom-structure-pin', 'set-custom-structure-tax'], read: ['parse-structure-fit'] },
  planner: { mutation: ['create-saved-plan', 'delete-saved-plan', 'rename-saved-plan', 'favorite-saved-plan'], read: ['resolve-entity-names', 'resolve-build-location', 'read-owned-assets', 'read-owned-blueprints', 'read-skill-levels'] },
  maps: { mutation: ['create-map', 'update-access', 'delete-map', 'restore-map', 'request-map-purge', 'eliminate-signatures', 'resolve-jump'], read: ['search-characters'] },
  admin: { mutation: ['unlink-character', 'revoke-user-sessions', 'reassign-character', 'requeue-esi-job', 'set-user-role', 'wh-statics-review'] },
  cron: { cron: ['drain-esi-refresh-jobs', 'refresh-affiliations', 'refresh-gsc', 'refresh-industry-indices', 'refresh-prices', 'refresh-sde', 'refresh-wh-statics', 'sync-sweeper', 'purge-maps'] },
  market: { mutation: ['refresh-market-prices', 'refresh-market-history'] },
  feedback: { mutation: ['submit-feedback'] },
  sync: { mutation: ['leave-location'], job: ['process-esi-refresh-job'] },
});

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
