import { readEnv } from '@/lib/env';
import { siteClassSet } from './site-filter';
import type { SiteDetail } from './types';

function samplePairKeys(site: SiteDetail): string[] {
  const classes = siteClassSet(site);
  return classes.length === 0
    ? [`${site.siteType}:none`]
    : classes.map((wormholeClass) => `${site.siteType}:${wormholeClass}`);
}

/**
 * Dev-only representative catalogue sample for fast /sites visual iteration.
 * Returns the reduced site list when sample mode is active, or null when it is
 * not. Activation requires both `NODE_ENV === 'development'` and the explicit
 * `LGI_SITES_SAMPLE=1` opt-in, making the mode impossible to enable in
 * production. Selection is deterministic and input-order-independent: the
 * lowest-id site covering each available type and wormhole-class pair is kept,
 * with class-less sites contributing a `(type, none)` pair. The returned array
 * preserves caller order. Callers own the visible labeling of the mode.
 */
export function selectDevSampleSites(sites: SiteDetail[]): SiteDetail[] | null {
  if (process.env.NODE_ENV !== 'development' || readEnv('LGI_SITES_SAMPLE') !== '1') {
    return null;
  }

  const selectedIds = new Set<number>();
  const coveredPairs = new Set<string>();
  const canonicalSites = sites.toSorted((left, right) => left.id - right.id);

  for (const site of canonicalSites) {
    const pairKeys = samplePairKeys(site);
    if (pairKeys.some((key) => !coveredPairs.has(key))) selectedIds.add(site.id);
    for (const key of pairKeys) coveredPairs.add(key);
  }

  return sites.filter((site) => selectedIds.has(site.id));
}
