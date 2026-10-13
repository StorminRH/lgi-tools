import { formatIskShort } from '@/lib/format/isk';
import { deriveSiteMeta } from './site-meta';
import { isWaveDrivenSiteType, primarySiteIsk } from './site-type';
import type { SiteDetail } from './types';

export interface SiteSocialCardContent {
  name: string;
  classification: string;
  value: string;
  valueCaption: string;
}

export function deriveSiteSocialCardContent(site: SiteDetail): SiteSocialCardContent {
  const { typeLabel, classLabel } = deriveSiteMeta(site);

  return {
    name: site.name,
    classification: [classLabel, typeLabel].filter(Boolean).join(' · '),
    value: formatIskShort(primarySiteIsk(site), { unit: true }),
    valueCaption: isWaveDrivenSiteType(site.siteType)
      ? 'ESTIMATED BLUE-LOOT VALUE'
      : 'LIVE JITA RESOURCE VALUE',
  };
}
