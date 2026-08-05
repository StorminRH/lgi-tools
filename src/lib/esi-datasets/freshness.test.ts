import { describe, expect, it } from 'vitest';
import {
  freshnessGate,
  isBoundaryStale,
  isBoundaryStaleMs,
} from './freshness';

type StaticWindowDatasetName = Parameters<typeof freshnessGate>[0];

const NOW = new Date('2026-07-17T12:00:00Z');
const STATIC_DATASETS = [
  'skills',
  'character_industry_jobs',
  'corporation_industry_jobs',
  'owned_assets',
  'owned_blueprints',
  'owned_structures',
  'affiliations',
  'market_prices',
] as const satisfies readonly StaticWindowDatasetName[];

describe.each(STATIC_DATASETS)('freshnessGate(%s)', (name) => {
  const gate = freshnessGate(name);

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
