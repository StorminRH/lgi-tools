import { describe, expect, it } from 'vitest';
import { createDiagnostics, cspDirectiveFromConsole, safeURL } from './diagnostics.cjs';
import { resolveLane, selectJourneys } from './lane-policy.cjs';
import inventory from './probe-registry.json';
const { probeRegistry, journeys } = inventory;
import { permitsReadOnlyHttp, permitsReadOnlySocket } from './readonly-policy.cjs';

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

  it('records expected disposition for aborted first-party navigation and prefetch cancellations', () => {
    const observed = createDiagnostics({ baseURL: 'http://localhost:3000', lane: 'mandatory', scenario: 'home' });
    observed.recordRequestFailure({
      url: 'http://localhost:3000/industry', method: 'GET', error: 'net::ERR_ABORTED',
      navigation: true, resourceType: 'document',
    });
    observed.recordRequestFailure({
      url: 'http://localhost:3000/sites', method: 'GET', error: 'NS_BINDING_ABORTED',
      prefetch: true, resourceType: 'fetch',
    });
    expect(observed.events).toEqual([
      {
        kind: 'request-failed', url: 'http://localhost:3000/industry', method: 'GET',
        disposition: 'expected', cancellation: 'navigation',
      },
      {
        kind: 'request-failed', url: 'http://localhost:3000/sites', method: 'GET',
        disposition: 'expected', cancellation: 'prefetch',
      },
    ]);
    expect(() => observed.assertClean()).not.toThrow();
  });

  it('fails aborted POST and aborted required API GET without navigation or prefetch context', () => {
    const observed = createDiagnostics({ baseURL: 'http://localhost:3000', lane: 'mandatory', scenario: 'home' });
    observed.recordRequestFailure({
      url: 'http://localhost:3000/api/maps/owned-map', method: 'POST', error: 'net::ERR_ABORTED',
      resourceType: 'fetch',
    });
    observed.recordRequestFailure({
      url: 'http://localhost:3000/api/session', method: 'GET', error: 'NS_BINDING_ABORTED',
      resourceType: 'fetch',
    });
    expect(observed.events).toEqual([
      { kind: 'request-failed', url: 'http://localhost:3000/api/maps/owned-map', method: 'POST', disposition: 'unexpected' },
      { kind: 'request-failed', url: 'http://localhost:3000/api/session', method: 'GET', disposition: 'unexpected' },
    ]);
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });

  it('treats loopback http and https as the same first party', () => {
    const observed = createDiagnostics({ baseURL: 'http://localhost:3000', lane: 'mandatory', scenario: 'home' });
    observed.recordRequestFailure({
      url: 'https://localhost:3000/_next/static/chunk.js', method: 'GET', error: 'net::ERR_SSL_PROTOCOL_ERROR',
    });
    expect(observed.events).toEqual([
      { kind: 'request-failed', url: 'https://localhost:3000/_next/static/chunk.js', method: 'GET', disposition: 'unexpected' },
    ]);
  });

  it('records a sanitized CSP directive from a browser console message', () => {
    expect(cspDirectiveFromConsole(
      'Refused to execute inline script because it violates the following Content Security Policy directive: "script-src \'self\' \'unsafe-inline\'".',
    )).toBe('script-src');
    const observed = createDiagnostics({ baseURL: 'http://localhost:3000', lane: 'mandatory', scenario: 'home' });
    observed.recordCsp(cspDirectiveFromConsole(
      'Refused to execute inline script because it violates the following Content Security Policy directive: "script-src-elem \'self\'". Note that \'unsafe-inline\' is ignored.',
    ));
    expect(observed.events).toEqual([
      { kind: 'csp', disposition: 'unexpected', directive: 'script-src-elem' },
    ]);
  });

  it('still fails a first-party request that did not complete', () => {
    const observed = createDiagnostics({ baseURL: 'http://localhost:3000', lane: 'mandatory', scenario: 'home' });
    observed.recordRequestFailure({
      url: 'http://localhost:3000/atlas', method: 'GET', error: 'net::ERR_CONNECTION_REFUSED',
    });
    expect(observed.events).toEqual([
      { kind: 'request-failed', url: 'http://localhost:3000/atlas', method: 'GET', disposition: 'unexpected' },
    ]);
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
