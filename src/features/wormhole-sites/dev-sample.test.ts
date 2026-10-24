import { afterEach, expect, test, vi } from 'vitest';
import { siteDetail } from './__tests__/site-fixtures';
import { selectDevSampleSites } from './dev-sample';
import { siteClassSet } from './site-filter';
import type { SiteDetail } from './types';

function representativeFixture(): SiteDetail[] {
  return [
    siteDetail({ id: 1, name: 'C1 Combat A', siteType: 'combat', wormholeClass: 'C1' }),
    siteDetail({ id: 2, name: 'C1 Combat B', siteType: 'combat', wormholeClass: 'C1' }),
    siteDetail({ id: 3, name: 'C2 Combat', siteType: 'combat', wormholeClass: 'C2' }),
    siteDetail({ id: 4, name: 'Classless Ore A', siteType: 'ore', wormholeClass: null }),
    siteDetail({ id: 5, name: 'Classless Ore B', siteType: 'ore', wormholeClass: null }),
    siteDetail({
      id: 6,
      name: 'Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    }),
    siteDetail({
      id: 7,
      name: 'Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    }),
    siteDetail({ id: 8, name: 'C3 Relic', siteType: 'relic', wormholeClass: 'C3' }),
  ];
}

function pairKeys(sites: SiteDetail[]): Set<string> {
  const keys = new Set<string>();
  for (const site of sites) {
    const classes = siteClassSet(site);
    if (classes.length === 0) keys.add(`${site.siteType}:none`);
    for (const wormholeClass of classes) keys.add(`${site.siteType}:${wormholeClass}`);
  }
  return keys;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test('selectDevSampleSites activates only for development plus the explicit 1 opt-in', () => {
  for (const [nodeEnv, sampleEnv] of [
    ['production', '1'],
    ['test', '1'],
    ['development', undefined],
    ['development', '0'],
    ['development', 'yes'],
  ] as const) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('LGI_SITES_SAMPLE', sampleEnv);
    expect(selectDevSampleSites(representativeFixture()), `${nodeEnv}/${sampleEnv}`).toBeNull();
  }

  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LGI_SITES_SAMPLE', '1');
  expect(selectDevSampleSites(representativeFixture())).not.toBeNull();
});

test('selectDevSampleSites keeps one stable representative per type and class pair, in caller order', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LGI_SITES_SAMPLE', '1');
  const select = (sites: SiteDetail[]) => selectDevSampleSites(sites) ?? [];

  const sites = representativeFixture();
  const sample = select(sites);
  expect(pairKeys(sample)).toEqual(pairKeys(sites));
  expect(sample.length).toBeLessThan(sites.length);
  expect(sample.length).toBeLessThanOrEqual(pairKeys(sites).size);

  // The same ids come back from any permutation, in the caller's order.
  const shuffled = [sites[7], sites[4], sites[6], sites[2], sites[0], sites[5], sites[3], sites[1]]
    .filter((site): site is SiteDetail => site !== undefined);
  const selectedIds = new Set(sample.map((site) => site.id));
  const shuffledSample = select(shuffled);
  expect(new Set(shuffledSample.map((site) => site.id))).toEqual(selectedIds);
  expect(shuffledSample.map((site) => site.id)).toEqual(
    shuffled.filter((site) => selectedIds.has(site.id)).map((site) => site.id),
  );

  expect(select([])).toEqual([]);
});
