import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/config/app-version';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { FAILURE_CATEGORIES } from '@/lib/failure';
import { withCorrelationScope, currentCorrelationId } from '@/transport/correlation';

const logUsageEventMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./queries', () => ({ logUsageEvent: logUsageEventMock }));
vi.mock('next/server', () => ({ after: (fn: () => unknown) => fn() }));

import {
  CAPABILITIES,
  recordCapabilityOutcome,
  type CapabilityId,
  type CapabilityOutcomeInput,
} from './capability';

beforeEach(() => {
  logUsageEventMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ids = Object.keys(CAPABILITIES) as CapabilityId[];

/** Records one outcome and returns the metadata that reached the telemetry writer. */
function recordedMetadata(
  id: CapabilityId,
  outcome: CapabilityOutcomeInput,
): Record<string, unknown> {
  logUsageEventMock.mockClear();
  recordCapabilityOutcome(id, outcome);
  const [event] = logUsageEventMock.mock.calls.at(-1) as unknown as [
    { metadata: Record<string, unknown> },
  ];
  return event.metadata;
}

describe('capability catalogue', () => {
  it('names all 40 instrumented operations exactly once', () => {
    expect(new Set(ids).size).toBe(40);
    expect(ids).toContain('admin.wh-statics-review');
    expect(ids).toContain('cron.refresh-wh-statics');
  });

  it('keeps operation names unique within each feature', () => {
    const seen = new Set<string>();
    for (const id of ids) {
      const { feature, operation } = CAPABILITIES[id];
      const key = `${feature}/${operation}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('recordCapabilityOutcome', () => {
  it('writes exactly one usage event carrying the full record', async () => {
    await withCorrelationScope(async () => {
      addDependencyTiming('neon', 8);
      recordCapabilityOutcome('planner.create-saved-plan', {
        outcome: 'conflict',
        code: 'template_limit',
        durationMs: 41,
        retry: null,
      });
    });

    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
    const [event] = logUsageEventMock.mock.calls[0] as unknown as [
      { action: string; metadata: Record<string, unknown> },
    ];
    expect(event.action).toBe('capability_outcome');
    expect(event.metadata).toEqual({
      feature: 'planner',
      operation: 'create-saved-plan',
      outcome: 'conflict',
      code: 'template_limit',
      durationMs: 41,
      dependencies: { neon: { ms: 8, calls: 1 } },
      retry: null,
      correlationId: expect.any(String),
      appVersion: APP_VERSION,
    });
  });

  it('records the operation’s own correlation id', async () => {
    const scopeId = await withCorrelationScope(async () => {
      const id = currentCorrelationId();
      recordCapabilityOutcome('account.save-preferences', {
        outcome: 'succeeded',
        code: 'ok',
        durationMs: 3,
        retry: null,
      });
      return id;
    });

    const [event] = logUsageEventMock.mock.calls[0] as unknown as [
      { metadata: { correlationId: string } },
    ];
    expect(event.metadata.correlationId).toBe(scopeId);
  });

  it('carries retry and rate-limit results for re-runnable work', async () => {
    await withCorrelationScope(async () => {
      recordCapabilityOutcome('sync.process-esi-refresh-job', {
        outcome: 'rate_limited',
        code: 'deferred_for_budget',
        durationMs: 12,
        retry: { attempt: 2, maxAttempts: 5, rateLimited: true },
      });
    });

    const [event] = logUsageEventMock.mock.calls[0] as unknown as [
      { metadata: { retry: unknown } },
    ];
    expect(event.metadata.retry).toEqual({ attempt: 2, maxAttempts: 5, rateLimited: true });
  });

  it('only ever records an outcome drawn from the 3.10.2.1 taxonomy', () => {
    const allowed = new Set<string>([...FAILURE_CATEGORIES, 'succeeded']);
    for (const outcome of [...FAILURE_CATEGORIES, 'succeeded'] as const) {
      const metadata = recordedMetadata('admin.set-user-role', {
        outcome,
        code: 'any_code',
        durationMs: 1,
        retry: null,
      });
      expect(allowed.has(metadata.outcome as string)).toBe(true);
    }
  });

  it('records an empty dependency map outside any correlation scope', () => {
    const metadata = recordedMetadata('cron.refresh-sde', {
      outcome: 'succeeded',
      code: 'ok',
      durationMs: 5,
      retry: null,
    });

    expect(metadata.dependencies).toEqual({});
    expect(metadata.correlationId).not.toBe('');
  });

  it('does not let a telemetry write failure reach the caller', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logUsageEventMock.mockRejectedValueOnce(new Error('telemetry down'));

    await withCorrelationScope(async () => {
      expect(() =>
        recordCapabilityOutcome('feedback.submit-feedback', {
          outcome: 'succeeded',
          code: 'ok',
          durationMs: 2,
          retry: null,
        }),
      ).not.toThrow();
    });

    await Promise.resolve();
    expect(errorSpy).toHaveBeenCalled();
  });
});

// HC-2: no high-cardinality identifier may become a metric label. `action`,
// `feature`, and `operation` are the only values grouped on, and all three come
// from closed `as const` vocabularies. Everything else in the record —
// correlation ids, durations, per-dependency timings — is a value, and grouping
// on any of them would create one series per request.
describe('metric label cardinality', () => {
  const HIGH_CARDINALITY_FIELDS = ['correlationId', 'durationMs', 'dependencies', 'retry'];

  it('never groups a telemetry query on a high-cardinality record field', () => {
    const sliQueries = readFileSync(
      path.join(process.cwd(), 'src/data/telemetry/sli-queries.ts'),
      'utf8',
    );
    const groupBys = [...sliQueries.matchAll(/\.groupBy\(([^)]*)\)/g)].map(([, args]) => args);
    for (const args of groupBys) {
      for (const field of HIGH_CARDINALITY_FIELDS) {
        expect(args, `groupBy must not reference ${field}`).not.toContain(field);
      }
    }
  });

  it('keeps the high-cardinality fields as recorded values, not labels', () => {
    const metadata = recordedMetadata('planner.create-saved-plan', {
      outcome: 'succeeded',
      code: 'ok',
      durationMs: 5,
      retry: null,
    });
    // Present in the record...
    for (const field of HIGH_CARDINALITY_FIELDS) {
      expect(Object.keys(metadata)).toContain(field);
    }
    // ...but never part of the identity the record is grouped by.
    expect(Object.keys(CAPABILITIES[ 'planner.create-saved-plan' ])).toEqual([
      'feature',
      'operation',
      'kind',
    ]);
  });
});
