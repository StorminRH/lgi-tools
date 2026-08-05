import { describe, expect, it } from 'vitest';
import { SLI_DEFINITIONS, SLI_FUTURE_DECISION, SLI_IDS, SLI_OWNERS } from './sli';

describe('SLI definitions', () => {
  it('covers exactly the five indicators the roadmap fixes', () => {
    expect(SLI_DEFINITIONS.map((sli) => sli.id)).toEqual([
      'read_success_rate',
      'mutation_success_rate',
      'critical_latency_p95',
      'esi_success_rate',
      'job_backlog',
    ]);
  });

  it('gives every indicator a named owner from the closed list', () => {
    for (const sli of SLI_DEFINITIONS) {
      expect(SLI_OWNERS).toContain(sli.owner);
    }
  });

  it('gives every indicator a written response action, not a restated title', () => {
    for (const sli of SLI_DEFINITIONS) {
      expect(sli.responseAction.length).toBeGreaterThan(40);
      expect(sli.responseAction).not.toBe(sli.title);
      expect(sli.measures.length).toBeGreaterThan(20);
    }
  });

  it('gives every indicator a stable id the admin panel can key its value by', () => {
    for (const sli of SLI_DEFINITIONS) {
      expect(SLI_IDS).toContain(sli.id);
    }
    expect(new Set(SLI_DEFINITIONS.map((sli) => sli.id)).size).toBe(SLI_DEFINITIONS.length);
  });

  it('routes the ESI indicator to the upstream owner with a do-not-retry action', () => {
    const esi = SLI_DEFINITIONS.find((sli) => sli.id === 'esi_success_rate');
    expect(esi?.owner).toBe('ccp-upstream');
    expect(esi?.responseAction).toMatch(/do not raise call volume/i);
  });

  it('declares a unit for every indicator so a value is never rendered ambiguously', () => {
    for (const sli of SLI_DEFINITIONS) {
      expect(['percent', 'milliseconds', 'count']).toContain(sli.unit);
    }
  });

  it('records the observability-vendor decision as deferred rather than taken', () => {
    expect(SLI_FUTURE_DECISION).toMatch(/OpenTelemetry/);
    expect(SLI_FUTURE_DECISION).toMatch(/deferred/i);
  });
});
