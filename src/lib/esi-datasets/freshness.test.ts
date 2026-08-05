import { describe, expect, it } from 'vitest';
import {
  freshnessGate,
  isBoundaryStale,
  isBoundaryStaleMs,
} from './freshness';

type StaticWindowDatasetName = Parameters<typeof freshnessGate>[0];

const NOW = new Date('2026-07-17T12:00:00Z');
// Independent [name, window] expectations: the registry values themselves are
// pinned in src/esi-datasets/registry.test.ts, but only this table falsifies
// the gate's NAME→WINDOW wiring (an entryNamed lookup bug that hands every
// gate the first entry's TTL passes any derived assertion).
const STATIC_WINDOWS = [
  ['skills', 120_000],
  ['character_industry_jobs', 300_000],
  ['corporation_industry_jobs', 300_000],
  ['owned_assets', 3_600_000],
  ['owned_blueprints', 3_600_000],
  ['owned_structures', 3_600_000],
  ['affiliations', 3_600_000],
  ['market_prices', 86_400_000],
] as const satisfies readonly (readonly [StaticWindowDatasetName, number])[];

// All static-window gates share one closure over the registry-derived TTL, so
// one dataset's boundary cases falsify the shared staleness math for all of
// them; the per-name table above owns the wiring.
describe('freshnessGate', () => {
  it('binds each static dataset to its own window and applies it at the boundaries', () => {
    for (const [name, ttlMs] of STATIC_WINDOWS) expect(freshnessGate(name).ttlMs).toBe(ttlMs);

    const gate = freshnessGate('skills');
    expect(gate.isStale(null, NOW)).toBe(true);
    expect(gate.isStale(new Date(NOW.getTime() - gate.ttlMs + 1_000), NOW)).toBe(false);
    expect(gate.isStale(new Date(NOW.getTime() - gate.ttlMs - 1_000), NOW)).toBe(true);
  });
});

describe('isBoundaryStale', () => {
  it('treats a missing boundary as stale', () => {
    expect(isBoundaryStale(undefined, NOW)).toBe(true);
  });

  it('keeps a future boundary fresh', () => {
    expect(isBoundaryStale(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('treats a reached boundary as stale', () => {
    expect(isBoundaryStale(NOW, NOW)).toBe(true);
  });
});

describe('isBoundaryStaleMs', () => {
  const nowMs = NOW.getTime();

  it('treats a reached boundary as stale', () => {
    expect(isBoundaryStaleMs(nowMs, nowMs)).toBe(true);
  });

  it('treats an earlier boundary as stale', () => {
    expect(isBoundaryStaleMs(nowMs - 1, nowMs)).toBe(true);
  });

  it('keeps a later boundary fresh', () => {
    expect(isBoundaryStaleMs(nowMs + 1, nowMs)).toBe(false);
  });
});
