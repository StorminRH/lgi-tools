import { describe, expect, it } from 'vitest';
import { assertMovementOutcome, assertPrincipal, assertRouteOutcome } from './route-contracts';

describe('route contracts', () => {
  const route = {
    actualURL: 'https://staging.lgi.tools/atlas',
    expectedURL: 'https://staging.lgi.tools/atlas',
    status: 200,
    ready: true,
    errorShell: false,
  };

  it.each([
    'https://lgi.tools/atlas',
    'https://staging.lgi.tools/atlas?auth_error=login_required',
    'https://staging.lgi.tools/atlas/nested',
  ])('requires exact origin, pathname and search: %s', (actualURL) => {
    expect(() => assertRouteOutcome({ ...route, actualURL })).toThrow('Route identity mismatch');
  });

  it.each([null, 302, 401, 404, 500])('rejects failed document navigation: %s', (status) => {
    expect(() => assertRouteOutcome({ ...route, status })).toThrow('Route navigation failed');
  });

  it.each([null, {}, { user: null }, { user: { id: 'owner' }, characterId: null }])(
    'validates untrusted session responses: %j', (session) => {
      expect(() => assertPrincipal({
        session, expected: { userId: 'owner', characterId: 1, name: 'Pilot' },
      })).toThrow('Authenticated principal');
    },
  );

  it('rejects nonfinite movement measurements and vacuous thresholds', () => {
    expect(() => assertMovementOutcome({ before: { x: 0, y: 0 }, after: { x: NaN, y: 20 }, minimumDistance: 10 }))
      .toThrow('Movement outcome failed');
    expect(() => assertMovementOutcome({ before: { x: 0, y: 0 }, after: { x: 0, y: 0 }, minimumDistance: 0 }))
      .toThrow('positive finite minimum distance');
  });
});
