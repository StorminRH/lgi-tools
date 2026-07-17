import { describe, expect, it } from 'vitest';
import {
  freshnessGate,
  isBoundaryStale,
  type StaticWindowDatasetName,
} from './freshness';

const NOW = new Date('2026-07-17T12:00:00Z');
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

describe.each(STATIC_WINDOWS)('freshnessGate(%s)', (name, expectedTtlMs) => {
  const gate = freshnessGate(name);

  it('pins the registry-derived window', () => {
    expect(gate.ttlMs).toBe(expectedTtlMs);
  });

  it('treats a missing refresh stamp as stale', () => {
    expect(gate.isStale(null, NOW)).toBe(true);
  });

  it('is fresh just inside the window', () => {
    const justInside = new Date(NOW.getTime() - gate.ttlMs + 1_000);
    expect(gate.isStale(justInside, NOW)).toBe(false);
  });

  it('is stale just outside the window', () => {
    const justOutside = new Date(NOW.getTime() - gate.ttlMs - 1_000);
    expect(gate.isStale(justOutside, NOW)).toBe(true);
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
