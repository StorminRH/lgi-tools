import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectDevSampleSites } from './dev-sample';
import { siteClassSet } from './site-filter';
import type { SiteDetail } from './types';

function makeSite(overrides: Partial<SiteDetail> = {}): SiteDetail {
  return {
    id: 1,
    name: 'Site 1',
    siteType: 'combat',
    wormholeClass: 'C1',
    signatureLabel: 'Combat Site',
    sourceTab: 'combat',
    blueLootIsk: null,
    iskPerEhp: null,
    resourceValueIsk: null,
    waves: [],
    resources: [],
    ...overrides,
  };
}

function representativeFixture(): SiteDetail[] {
  return [
    makeSite({ id: 1, name: 'C1 Combat A' }),
    makeSite({ id: 2, name: 'C1 Combat B' }),
    makeSite({ id: 3, name: 'C2 Combat', wormholeClass: 'C2' }),
    makeSite({ id: 4, name: 'Classless Ore A', siteType: 'ore', wormholeClass: null }),
    makeSite({ id: 5, name: 'Classless Ore B', siteType: 'ore', wormholeClass: null }),
    makeSite({
      id: 6,
      name: 'Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    }),
    makeSite({
      id: 7,
      name: 'Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    }),
    makeSite({ id: 8, name: 'C3 Relic', siteType: 'relic', wormholeClass: 'C3' }),
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

describe('selectDevSampleSites activation', () => {
  it.each([
    ['production', '1'],
    ['test', '1'],
    ['development', undefined],
    ['development', '0'],
    ['development', 'yes'],
  ])('stays inactive for NODE_ENV=%s and LGI_SITES_SAMPLE=%s', (nodeEnv, sampleEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('LGI_SITES_SAMPLE', sampleEnv);

    expect(selectDevSampleSites(representativeFixture())).toBeNull();
  });

  it('activates only for development plus the explicit 1 opt-in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LGI_SITES_SAMPLE', '1');

    expect(selectDevSampleSites(representativeFixture())).not.toBeNull();
  });
});

describe('selectDevSampleSites selection', () => {
  function select(sites: SiteDetail[]): SiteDetail[] {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LGI_SITES_SAMPLE', '1');
    return selectDevSampleSites(sites) ?? [];
  }

  it('covers every type and class pair while keeping a strict representative subset', () => {
    const sites = representativeFixture();
    const sample = select(sites);

    expect(pairKeys(sample)).toEqual(pairKeys(sites));
    expect(sample.length).toBeLessThan(sites.length);
    expect(sample.length).toBeLessThanOrEqual(pairKeys(sites).size);
  });

  it('selects the same ids across permutations and preserves caller order', () => {
    const sites = representativeFixture();
    const shuffled = [sites[7], sites[4], sites[6], sites[2], sites[0], sites[5], sites[3], sites[1]]
      .filter((site): site is SiteDetail => site !== undefined);
    const selectedIds = new Set(select(sites).map((site) => site.id));
    const shuffledSample = select(shuffled);

    expect(new Set(shuffledSample.map((site) => site.id))).toEqual(selectedIds);
    expect(shuffledSample.map((site) => site.id)).toEqual(
      shuffled.filter((site) => selectedIds.has(site.id)).map((site) => site.id),
    );
  });

  it('returns an empty active sample for an empty catalogue', () => {
    expect(select([])).toEqual([]);
  });
});
