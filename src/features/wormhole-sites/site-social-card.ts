import { formatIskHeader } from './format';
import { deriveSiteMeta } from './site-meta';
import type { SiteDetail } from './types';

interface SiteSocialCardContent {
  name: string;
  classification: string;
  value: string;
  valueCaption: string;
}

/** Derives social-card title, classification, resource summary, and NPC count from one site detail. */
export function deriveSiteSocialCardContent(site: SiteDetail): SiteSocialCardContent {
  const { typeLabel, classLabel } = deriveSiteMeta(site);
  const isResourceSite = site.siteType === 'ore' || site.siteType === 'gas';
  const isk = isResourceSite ? site.resourceValueIsk : site.blueLootIsk;

  return {
    name: site.name,
    classification: [classLabel, typeLabel].filter(Boolean).join(' · '),
    value: formatIskHeader(isk),
    valueCaption: isResourceSite ? 'LIVE JITA RESOURCE VALUE' : 'ESTIMATED BLUE-LOOT VALUE',
  };
}
