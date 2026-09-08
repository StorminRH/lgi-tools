import { describe, expect, it } from 'vitest';
import { createDiagnostics, requireBackend } from './diagnostics.cjs';
import {
  assertMapRole,
  assertMovementOutcome,
  assertPrincipal,
  assertRouteOutcome,
} from './route-contracts';

const route = {
  expectedURL: 'http://127.0.0.1:3000/skills',
  actualURL: 'http://127.0.0.1:3000/skills',
  status: 200,
  ready: true,
  errorShell: false,
};
const principal = { userId: 'run-owner', characterId: 9_000_001, name: 'Run Owner' };
const session = { user: { id: principal.userId }, characterId: principal.characterId, name: principal.name };

function diagnostics() {
  return createDiagnostics({
    baseURL: 'http://127.0.0.1:3000',
    backendURL: 'http://127.0.0.1:3210',
    lane: 'mandatory',
    scenario: 'falsifier',
  });
}

describe('mandatory acceptance falsifiers', () => {
  it('rejects a quiet redirect even when the destination has ready content', () => {
    expect(() => assertRouteOutcome(route)).not.toThrow();
    expect(() => assertRouteOutcome({ ...route, actualURL: 'http://127.0.0.1:3000/' }))
      .toThrow('Route identity mismatch');
  });

  it('rejects a 200 error shell and an indefinitely loading route', () => {
    expect(() => assertRouteOutcome({ ...route, errorShell: true }))
      .toThrow('required ready state');
    expect(() => assertRouteOutcome({ ...route, ready: false }))
      .toThrow('required ready state');
  });

  it('rejects a first-party 500 even without a requestfailed event', () => {
    const observed = diagnostics();
    observed.recordHttp({ url: 'http://127.0.0.1:3000/api/industry/plans', method: 'GET', status: 500 });
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
    observed.expectHttp({ pathname: '/api/feedback', method: 'POST', status: 500 });
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });

  it('blocks missing Convex configuration and fails a refused required backend', () => {
    expect(() => requireBackend({ required: true, url: '', deployment: '' }))
      .toThrow('BLOCKED prerequisite');
    const observed = diagnostics();
    observed.recordRequestFailure({ url: 'http://127.0.0.1:3210/api/query', method: 'POST' });
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });

  it('rejects the wrong principal despite a valid authenticated session', () => {
    expect(() => assertPrincipal({ session, expected: principal })).not.toThrow();
    expect(() => assertPrincipal({ session: { ...session, user: { id: 'different-account' } }, expected: principal }))
      .toThrow('required account');
    expect(() => assertPrincipal({ session: { ...session, characterId: 9_000_002 }, expected: principal }))
      .toThrow('required account');
  });

  it('rejects a viewer substituted for the required editor role', () => {
    expect(() => assertMapRole({ actual: 'editor', required: 'editor' })).not.toThrow();
    expect(() => assertMapRole({ actual: 'viewer', required: 'editor' })).toThrow('Map role mismatch');
  });

  it('rejects an inert drag rather than accepting the visible map', () => {
    const before = { x: 100, y: 80 };
    expect(() => assertMovementOutcome({ before, after: { x: 180, y: 80 }, minimumDistance: 40 }))
      .not.toThrow();
    expect(() => assertMovementOutcome({ before, after: before, minimumDistance: 40 }))
      .toThrow('Movement outcome failed');
  });

  it('fails when the expected route or displacement is deliberately made wrong', () => {
    expect(() => assertRouteOutcome({ ...route, expectedURL: 'http://127.0.0.1:3000/jobs' }))
      .toThrow('Route identity mismatch');
    expect(() => assertMovementOutcome({ before: { x: 100, y: 80 }, after: { x: 180, y: 80 }, minimumDistance: 100 }))
      .toThrow('Movement outcome failed');
  });

  it('does not turn an exact expected 403 into a broad error allowlist', () => {
    const observed = diagnostics();
    observed.expectHttp({ pathname: '/api/maps/owned-map', method: 'PATCH', status: 403 });
    observed.recordHttp({ url: 'http://127.0.0.1:3000/api/maps/owned-map', method: 'PATCH', status: 403 });
    expect(() => observed.assertClean()).not.toThrow();
    observed.recordHttp({ url: 'http://127.0.0.1:3000/api/maps/other-map', method: 'PATCH', status: 403 });
    expect(() => observed.assertClean()).toThrow('DIAGNOSTICS');
  });
});
