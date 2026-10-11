import { vi } from 'vitest';

/**
 * A typed stand-in for `emitCostMetric`. Route to it from the suite's own
 * `vi.mock('@/data/telemetry/cost-metrics', ...)` factory: the factory has to
 * stay in the suite file so vitest can hoist it.
 */
export function capabilityOutcomeMock() {
  return vi.fn<(action: string, metadata: Record<string, unknown>) => void>();
}

/** The capability outcomes the stand-in recorded, in call order. */
export function recordedCapabilityOutcomes(emit: ReturnType<typeof capabilityOutcomeMock>) {
  return emit.mock.calls.flatMap(([action, record]) =>
    action === 'capability_outcome' ? [{ outcome: record.outcome, code: record.code }] : [],
  );
}
