// Exercises every service-indicator query against the local Docker Postgres with
// known seeded rows, so each indicator's arithmetic — not just its ability to run
// — is asserted. Skips cleanly when no DB is reachable (see the harness
// `canReachDb`), keeping a DB-less `pnpm verify` / CI run green.
//
// Precondition: `pnpm db:migrate` must have run. The harness clones tables from
// the migrated `public` schema, so an un-migrated database would clone shapes
// without the constraints and enums these seeds rely on.
import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { usageLogs } from './schema';
import {
  getCriticalLatencyP95,
  getEsiSuccessRate,
  getMutationSuccessRate,
  getReadSuccessRate,
} from './sli-queries';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_sli',
  tables: ['usage_logs', 'characters'],
  steerDbProxy: true,
});

// A fixed historical week, far from real data and from defaultNow().
const RANGE = {
  from: new Date('2020-03-01T00:00:00Z'),
  to: new Date('2020-03-08T00:00:00Z'),
};
const IN_RANGE = new Date('2020-03-03T12:00:00Z');
const EMPTY_RANGE = {
  from: new Date('2019-01-01T00:00:00Z'),
  to: new Date('2019-01-08T00:00:00Z'),
};

function capabilityRow(metadata: Record<string, unknown>) {
  return {
    timestamp: IN_RANGE,
    action: 'capability_outcome',
    metadata: {
      feature: 'planner',
      code: 'ok',
      durationMs: 10,
      dependencies: {},
      retry: null,
      correlationId: 'seeded',
      appVersion: 'test',
      ...metadata,
    },
  };
}

describe.skipIf(!harness.reachable)('service indicator queries', () => {
  beforeAll(async () => {
    await harness.db.insert(usageLogs).values([
      // Tool reads. The two `resolve-entity-names` rows seeded further down are
      // also reads, so the read population is 6 rows of which 4 succeeded.
      capabilityRow({ operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 100 }),
      capabilityRow({ operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 200 }),
      capabilityRow({ operation: 'read-skill-levels', outcome: 'succeeded', durationMs: 300 }),
      capabilityRow({
        operation: 'read-owned-blueprints',
        outcome: 'dependency_unavailable',
        durationMs: 400,
      }),

      // Mutations: 2 succeeded, 1 conflict, 1 validation. Validation is excluded,
      // so the denominator is 3 and the rate is 2/3.
      capabilityRow({ operation: 'create-saved-plan', outcome: 'succeeded', durationMs: 500 }),
      capabilityRow({ operation: 'rename-saved-plan', outcome: 'succeeded', durationMs: 600 }),
      capabilityRow({
        operation: 'create-saved-plan',
        outcome: 'conflict',
        code: 'template_limit',
        durationMs: 700,
      }),
      capabilityRow({ operation: 'delete-saved-plan', outcome: 'validation', durationMs: 800 }),

      // ESI-dependent rows: 1 of 2 healthy → 50%.
      capabilityRow({
        operation: 'resolve-entity-names',
        outcome: 'succeeded',
        durationMs: 900,
        dependencies: { esi: { ms: 40, calls: 1 } },
      }),
      capabilityRow({
        operation: 'resolve-entity-names',
        outcome: 'rate_limited',
        durationMs: 1_000,
        dependencies: { esi: { ms: 5, calls: 1 } },
      }),

      // A cron row: not user-facing, so it must not enter the read, mutation, or
      // latency populations.
      capabilityRow({
        feature: 'cron',
        operation: 'refresh-prices',
        outcome: 'succeeded',
        durationMs: 999_999,
      }),
    ]);

  });

  it('reports the tool-read success rate over the window', async () => {
    // 4 succeeded of 6 recorded reads; unlike mutations, no outcome is excluded.
    expect(await getReadSuccessRate(RANGE)).toBeCloseTo(4 / 6, 5);
  });

  it('excludes validation failures from the mutation success rate', async () => {
    // 2 succeeded of 3 non-validation mutations; counting the validation row
    // would give 2/4 and make a correctly rejected request look like breakage.
    expect(await getMutationSuccessRate(RANGE)).toBeCloseTo(2 / 3, 5);
  });

  it('reports p95 latency across user-facing operations only', async () => {
    const p95 = await getCriticalLatencyP95(RANGE);
    // The 999,999 ms cron row is excluded; the user-facing durations top out at
    // 1,000 ms, so a p95 above that would mean the cron leaked into the set.
    expect(p95).not.toBeNull();
    expect(p95 as number).toBeLessThanOrEqual(1_000);
    expect(p95 as number).toBeGreaterThanOrEqual(900);
  });

  it('reports the ESI success rate over rows that recorded ESI time', async () => {
    expect(await getEsiSuccessRate(RANGE)).toBeCloseTo(1 / 2, 5);
  });

  it('returns null rather than zero for a window with no recorded operations', async () => {
    // An empty window must render as “—”; a 0% would read as total failure.
    expect(await getReadSuccessRate(EMPTY_RANGE)).toBeNull();
    expect(await getMutationSuccessRate(EMPTY_RANGE)).toBeNull();
    expect(await getCriticalLatencyP95(EMPTY_RANGE)).toBeNull();
    expect(await getEsiSuccessRate(EMPTY_RANGE)).toBeNull();
  });
});
