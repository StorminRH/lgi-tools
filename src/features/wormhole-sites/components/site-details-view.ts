import { isWaveDrivenSiteType } from '../site-type';
import type { SiteDetail, SiteType } from '../types';

const RESOURCE_SECTION_COPY = {
  ore:    { label: 'Ore deposits',        hint: 'Qty · m³ · est. ISK',   footer: 'Total ore value' },
  gas:    { label: 'Gas clouds',          hint: 'Units · m³ · est. ISK', footer: 'Total gas value' },
  relic:  { label: 'Hackable containers', hint: 'Est. ISK per can',      footer: 'Total container value' },
  data:   { label: 'Hackable containers', hint: 'Est. ISK per can',      footer: 'Total container value' },
  combat: { label: 'Resources',           hint: '',                      footer: 'Total value' },
} satisfies Record<SiteType, { label: string; hint: string; footer: string }>;

export type SiteDetailsView = {
  isWaveDriven: boolean;
  hasResources: boolean;
  isGas: boolean;
  hasWaves: boolean;
  sectionLabel: string;
  sectionHint: string;
  footerLabel: string;
};

export function deriveSiteDetailsView(site: SiteDetail): SiteDetailsView {
  const copy = RESOURCE_SECTION_COPY[site.siteType];
  return {
    isWaveDriven: isWaveDrivenSiteType(site.siteType),
    hasResources: site.resources.length > 0,
    isGas: site.siteType === 'gas',
    hasWaves: site.waves.length > 0,
    sectionLabel: copy.label,
    sectionHint: copy.hint,
    footerLabel: copy.footer,
  };
}
