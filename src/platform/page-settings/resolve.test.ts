import { describe, expect, it } from 'vitest';
import { resolveSpecForPath } from './resolve';
import type { PageSettingsSpec } from './types';

const spec = (route: string): PageSettingsSpec => ({ route });

describe('resolveSpecForPath', () => {
  const specs = [spec('/sites'), spec('/industry'), spec('/industry/build')];

  it('matches an exact route', () => {
    expect(resolveSpecForPath('/sites', specs)?.route).toBe('/sites');
  });

  it('matches a sub-route by path segment', () => {
    expect(resolveSpecForPath('/sites/30002', specs)?.route).toBe('/sites');
  });

  it('does not match a non-segment prefix', () => {
    expect(resolveSpecForPath('/sitesfoo', specs)).toBeNull();
  });

  it('prefers the most specific (longest) matching route', () => {
    expect(resolveSpecForPath('/industry/build/x', specs)?.route).toBe('/industry/build');
    expect(resolveSpecForPath('/industry/123', specs)?.route).toBe('/industry');
  });

  it('returns null for an unregistered route', () => {
    expect(resolveSpecForPath('/skills', specs)).toBeNull();
  });

  it('returns null for an empty pathname (the static shell, before the route streams in)', () => {
    expect(resolveSpecForPath('', specs)).toBeNull();
  });
});
