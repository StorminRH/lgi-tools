import type { SiteDetail, SiteType } from '../types';

const RESOURCE_SECTION_COPY = {
  ore:    { label: 'Ore Deposits',        hint: 'qty · m³ · est. ISK',   footer: 'Total ore value' },
  gas:    { label: 'Gas Clouds',          hint: 'units · m³ · est. ISK', footer: 'Total gas value' },
  relic:  { label: 'Hackable Containers', hint: 'est. ISK per can',      footer: 'Total container value' },
  data:   { label: 'Hackable Containers', hint: 'est. ISK per can',      footer: 'Total container value' },
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
  const isHackSite = site.siteType === 'relic' || site.siteType === 'data';
  const copy = RESOURCE_SECTION_COPY[site.siteType];
  return {
    isWaveDriven: site.siteType === 'combat' || isHackSite,
    hasResources: site.resources.length > 0,
    isGas: site.siteType === 'gas',
    hasWaves: site.waves.length > 0,
    sectionLabel: copy.label,
    sectionHint: copy.hint,
    footerLabel: copy.footer,
  };
}
