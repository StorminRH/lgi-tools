import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { usageLogs } from './schema';
import {
  countCapabilityOutcome,
  listCapabilityFailures,
  listDailyCapabilityFailures,
  listEsiFailures,
  listSlowestOperations,
} from './sli-breakdown';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_sli_breakdown',
  tables: ['usage_logs', 'characters'],
  steerDbProxy: true,
});

const RANGE = {
  from: new Date('2020-03-01T00:00:00Z'),
  to: new Date('2020-03-08T00:00:00Z'),
};
const DAY_ONE = new Date('2020-03-02T12:00:00Z');
const DAY_TWO = new Date('2020-03-04T09:00:00Z');

function capabilityRow(timestamp: Date, metadata: Record<string, unknown>) {
  return {
    timestamp,
    action: 'capability_outcome',
    metadata: {
      feature: 'account',
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

describe.skipIf(!harness.reachable)('service level breakdown queries', () => {
  beforeAll(async () => {
    await harness.db.insert(usageLogs).values([
      capabilityRow(DAY_ONE, { operation: 'save-preferences', outcome: 'succeeded' }),
      capabilityRow(DAY_ONE, { operation: 'save-preferences', outcome: 'unexpected', code: 'unexpected', errorClass: '23502' }),
      capabilityRow(DAY_TWO, { operation: 'save-preferences', outcome: 'unexpected', code: 'unexpected', errorClass: '23502' }),
      capabilityRow(DAY_TWO, { operation: 'save-preferences', outcome: 'validation', code: 'invalid_value' }),
      capabilityRow(DAY_TWO, {
        feature: 'maps',
        operation: 'create-map',
        outcome: 'dependency_unavailable',
        code: 'projection_unavailable',
        durationMs: 900,
        dependencies: { neon: { ms: 30, calls: 2 } },
      }),
      capabilityRow(DAY_ONE, {
        feature: 'planner',
        operation: 'read-owned-assets',
        outcome: 'rate_limited',
        code: 'esi_rate_limited',
        durationMs: 2_000,
        dependencies: { esi: { ms: 1_800, calls: 3 }, neon: { ms: 20, calls: 1 } },
      }),
    ]);
  });

  it('groups failed saves by operation, result and error class, leaving validation out', async () => {
    await expect(listCapabilityFailures(RANGE, 'mutation', ['validation'])).resolves.toEqual([
      {
        feature: 'account',
        operation: 'save-preferences',
        outcome: 'unexpected',
        code: 'unexpected',
        errorClass: '23502',
        count: 2,
        lastSeen: DAY_TWO,
      },
      {
        feature: 'maps',
        operation: 'create-map',
        outcome: 'dependency_unavailable',
        code: 'projection_unavailable',
        errorClass: null,
        count: 1,
        lastSeen: DAY_TWO,
      },
    ]);
    await expect(countCapabilityOutcome(RANGE, 'mutation', 'validation')).resolves.toBe(1);
  });

  it('counts failures per day', async () => {
    await expect(listDailyCapabilityFailures(RANGE, 'mutation', ['validation'])).resolves.toEqual([
      { day: '2020-03-02', failures: 1 },
      { day: '2020-03-04', failures: 2 },
    ]);
  });

  it('ranks the slowest operations and names where their time went', async () => {
    const slowest = await listSlowestOperations(RANGE);
    expect(slowest[0]).toEqual({
      feature: 'planner',
      operation: 'read-owned-assets',
      p95Ms: 2_000,
      count: 1,
      slowestDependency: 'esi',
    });
    expect(slowest.find((row) => row.operation === 'save-preferences')?.slowestDependency).toBeNull();
  });

  it('lists ESI-dependent operations CCP limited or failed', async () => {
    await expect(listEsiFailures(RANGE)).resolves.toEqual([
      {
        feature: 'planner',
        operation: 'read-owned-assets',
        outcome: 'rate_limited',
        code: 'esi_rate_limited',
        errorClass: null,
        count: 1,
        lastSeen: DAY_ONE,
      },
    ]);
  });
});
