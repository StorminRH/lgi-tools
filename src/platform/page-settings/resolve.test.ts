import { describe, expect, it } from 'vitest';
import { resolveSpecForPath } from './resolve';
import type { PageSettingsSpec } from './types';

const spec = (route: string): PageSettingsSpec => ({ route });

describe('resolveSpecForPath', () => {
  it('matches path segments, prefers the longest route, and rejects empty/non-segment prefixes', () => {
    const specs: PageSettingsSpec[] = [
      spec('/sites'),
      spec('/industry'),
      spec('/industry/build'),
    ];
    expect(resolveSpecForPath('/sites', specs)?.route).toBe('/sites');
    expect(resolveSpecForPath('/sites/30002', specs)?.route).toBe('/sites');
    expect(resolveSpecForPath('/sitesfoo', specs)).toBeNull();
    expect(resolveSpecForPath('/industry/build/x', specs)?.route).toBe('/industry/build');
    expect(resolveSpecForPath('/industry/123', specs)?.route).toBe('/industry');
    expect(resolveSpecForPath('', specs)).toBeNull();
    expect(resolveSpecForPath('/skills', specs)).toBeNull();
  });
});
