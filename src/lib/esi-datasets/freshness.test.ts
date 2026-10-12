import { describe, expect, it } from 'vitest';
import { freshnessGate } from './freshness';

type StaticWindowDatasetName = Parameters<typeof freshnessGate>[0];

const NOW = new Date('2026-07-17T12:00:00Z');
const STATIC_WINDOWS = [
  ['skills', 120_000],
  ['character_industry_jobs', 300_000],
  ['corporation_industry_jobs', 300_000],
  ['owned_assets', 3_600_000],
  ['owned_blueprints', 3_600_000],
  ['owned_structures', 3_600_000],
  ['affiliations', 3_600_000],
  ['market_prices', 300_000],
] as const satisfies readonly (readonly [StaticWindowDatasetName, number])[];

describe('freshnessGate', () => {
  it('binds each static dataset to its own window and applies it at the boundaries', () => {
    for (const [name, ttlMs] of STATIC_WINDOWS) expect(freshnessGate(name).ttlMs).toBe(ttlMs);

    const gate = freshnessGate('skills');
    expect(gate.isStale(null, NOW)).toBe(true);
    expect(gate.isStale(new Date(NOW.getTime() - gate.ttlMs + 1_000), NOW)).toBe(false);
    expect(gate.isStale(new Date(NOW.getTime() - gate.ttlMs - 1_000), NOW)).toBe(true);
  });
});
