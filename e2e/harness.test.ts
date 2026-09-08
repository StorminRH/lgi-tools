import { describe, expect, it } from 'vitest';
import { createDiagnostics, safeURL } from './diagnostics.mjs';
import { resolveLane, selectJourneys } from './lane-policy.mjs';
import inventory from './probe-registry.json';
const { probeRegistry, journeys } = inventory;
import { permitsReadOnlyHttp, permitsReadOnlySocket } from './readonly-policy.mjs';

const local = { PLAYWRIGHT_BASE_URL: 'http://localhost:3000' };

describe('acceptance selection and evidence boundaries', () => {
  it('prevents HTTP and Convex mutations in deployed read-only contexts', () => {
    expect(permitsReadOnlyHttp('GET')).toBe(true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(permitsReadOnlyHttp(method)).toBe(false);
    expect(permitsReadOnlySocket(JSON.stringify({ type: 'ModifyQuerySet' }))).toBe(true);
    for (const message of ['Mutation', 'Action', 'Event', 'unknown']) {
      expect(permitsReadOnlySocket(JSON.stringify({ type: message }))).toBe(false);
    }
    expect(permitsReadOnlySocket('invalid')).toBe(false);
    expect(permitsReadOnlySocket(Buffer.from('secret'))).toBe(false);
  });
  it('defaults to only mandatory production and requires an explicit optional selection', () => {
    expect(resolveLane({ env: local }).lane).toBe('mandatory-production');
    for (const lane of ['local-mutation', 'dev-only', 'benchmark']) {
      expect(() => resolveLane({ env: { ...local, E2E_LANE: lane } })).toThrow('select E2E_SCENARIOS');
      expect(resolveLane({ env: { ...local, E2E_LANE: lane, E2E_SCENARIOS: 'selected-journey' } }).lane).toBe(lane);
    }
    expect(() => resolveLane({ env: local, argv: ['--pass-with-no-tests'] })).toThrow('empty selection');
    expect(() => resolveLane({ env: local, argv: ['--no-deps'] })).toThrow('dependencies');
  });

  it('prevents deployed mutation and local server use in deployed read-only', () => {
    expect(() => resolveLane({ env: { PLAYWRIGHT_BASE_URL: 'https://lgi.tools' } })).toThrow('deployed-readonly');
    expect(() => resolveLane({ env: { ...local, E2E_LANE: 'deployed-readonly' } })).toThrow('deployed-readonly');
    expect(resolveLane({ env: { PLAYWRIGHT_BASE_URL: 'https://preview.example', E2E_LANE: 'deployed-readonly' } }).local).toBe(false);
  });

  it('accounts for every historical probe and resolves retained journeys', () => {
    expect(probeRegistry).toHaveLength(64);
    expect(new Set(probeRegistry.map((probe) => probe.id)).size).toBe(64);
    const ids = new Set(journeys.map((journey) => journey.id));
    for (const probe of probeRegistry) {
      expect(probe.reason.length).toBeGreaterThan(10);
      if (probe.disposition !== 'remove' && probe.journey !== 'atlas-guest') {
        expect(probe.journey).not.toBeNull();
        expect(typeof probe.journey === 'string' && ids.has(probe.journey), probe.id).toBe(true);
      }
    }
  });

  it('lists only the chosen lane and rejects cross-lane or nonexistent journeys', () => {
    expect(selectJourneys({ journeys, lane: 'local-mutation', scenarioIds: ['atlas-access'] })
      .map((journey: { id: string }) => journey.id)).toEqual(['atlas-access']);
    expect(() => selectJourneys({ journeys, lane: 'dev-only', scenarioIds: ['atlas-access'] })).toThrow('requires lane');
    expect(() => selectJourneys({ journeys, lane: 'local-mutation', scenarioIds: ['unknown'] })).toThrow('unknown journey');
    expect(selectJourneys({ journeys, lane: 'local-mutation', scenarioIds: [], list: true }).length).toBeGreaterThan(0);
  });

  it('keeps query credentials, userinfo and arbitrary error text out of diagnostics', () => {
    const observed = createDiagnostics({ baseURL: 'https://preview.example', lane: 'deployed-readonly', scenario: 'home' });
    observed.recordHttp({ url: 'https://user:password@preview.example/api/session?token=secret#cookie', method: 'GET', status: 500 });
    observed.recordPageError();
    observed.recordConsoleError();
    const evidence = JSON.stringify(observed.events);
    expect(evidence).not.toMatch(/password|token|secret|cookie|user:/);
    expect(safeURL('not-a-url containing secrets')).toBe('[invalid-url]');
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });

  it('bounds evidence without losing failures after the buffer is full', () => {
    const observed = createDiagnostics({ baseURL: 'https://preview.example', lane: 'deployed-readonly', scenario: 'home' });
    for (let i = 0; i < 120; i += 1) {
      observed.recordHttp({ url: 'https://third.example/image', method: 'GET', status: 404 });
    }
    observed.recordHttp({ url: 'https://preview.example/api/session', method: 'GET', status: 500 });
    expect(observed.events).toHaveLength(100);
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });
});
