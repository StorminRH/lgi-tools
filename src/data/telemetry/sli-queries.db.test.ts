import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { usageLogs } from './schema';
import { capabilitySuccessRate, esiAvailability } from './capability-stats';
import { getEsiAvailability } from './queries';
import { getCapabilityLatency, getCapabilityOutcomeStats } from './sli-breakdown';

const harness = await createDbTestHarness({
  schema: 'test_telemetry_sli',
  tables: ['usage_logs', 'characters'],
  steerDbProxy: true,
});

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
      capabilityRow({ operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 100.25 }),
      capabilityRow({ operation: 'read-owned-assets', outcome: 'succeeded', durationMs: 200.875 }),
      capabilityRow({ operation: 'read-skill-levels', outcome: 'succeeded', durationMs: 300 }),
      capabilityRow({
        operation: 'read-owned-blueprints',
        outcome: 'dependency_unavailable',
        durationMs: 400,
      }),

      capabilityRow({ operation: 'create-saved-plan', outcome: 'succeeded', durationMs: 500 }),
      capabilityRow({ operation: 'rename-saved-plan', outcome: 'succeeded', durationMs: 600 }),
      capabilityRow({
        operation: 'create-saved-plan',
        outcome: 'conflict',
        code: 'template_limit',
        durationMs: 700,
      }),
      capabilityRow({ operation: 'delete-saved-plan', outcome: 'validation', durationMs: 800 }),

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

      capabilityRow({
        feature: 'cron',
        operation: 'refresh-prices',
        outcome: 'succeeded',
        durationMs: 999_999,
      }),
    ]);

  });

  it('reports the tool-read success rate over the window', async () => {
    expect(capabilitySuccessRate(await getCapabilityOutcomeStats(RANGE), 'read')).toBeCloseTo(4 / 6, 5);
  });

  it('excludes validation failures from the mutation success rate', async () => {
    expect(capabilitySuccessRate(await getCapabilityOutcomeStats(RANGE), 'mutation')).toBeCloseTo(2 / 3, 5);
  });

  it('reports p95 latency across user-facing operations only', async () => {
    const { p95 } = await getCapabilityLatency(RANGE);
    expect(p95).not.toBeNull();
    expect(p95 as number).toBeLessThanOrEqual(1_000);
    expect(p95 as number).toBeGreaterThanOrEqual(900);
  });

  it('reports the ESI success rate over rows that recorded ESI time', async () => {
    const availability = esiAvailability(await getCapabilityOutcomeStats(RANGE));
    expect(availability).toEqual({ total: 2, healthy: 1, rate: 0.5 });
    await expect(getEsiAvailability(RANGE)).resolves.toEqual(availability);
  });

  it('returns null rather than zero for a window with no recorded operations', async () => {
    const stats = await getCapabilityOutcomeStats(EMPTY_RANGE);
    expect(stats).toEqual([]);
    expect(capabilitySuccessRate(stats, 'read')).toBeNull();
    expect(capabilitySuccessRate(stats, 'mutation')).toBeNull();
    expect(esiAvailability(stats).rate).toBeNull();
    await expect(getCapabilityLatency(EMPTY_RANGE)).resolves.toEqual({ p95: null, slowest: [] });
    await expect(getEsiAvailability(EMPTY_RANGE)).resolves.toEqual({ total: 0, healthy: 0, rate: null });
  });
});
