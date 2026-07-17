import type { SiteDetail, SiteType } from '../types';

// Section copy per site type — the label, the column-hint line, and the total
// footer. `combat` never renders this section (its body is waves), but the map
// stays exhaustive so a new site type is a compile error here.
const RESOURCE_SECTION_COPY = {
  ore:    { label: 'Ore Deposits',        hint: 'qty · m³ · est. ISK',   footer: 'Total ore value' },
  gas:    { label: 'Gas Clouds',          hint: 'units · m³ · est. ISK', footer: 'Total gas value' },
  relic:  { label: 'Hackable Containers', hint: 'est. ISK per can',      footer: 'Total container value' },
  data:   { label: 'Hackable Containers', hint: 'est. ISK per can',      footer: 'Total container value' },
  combat: { label: 'Resources',           hint: '',                      footer: 'Total value' },
} satisfies Record<SiteType, { label: string; hint: string; footer: string }>;

/**
 * Display-ready site details state for wormhole sites; consumers can render it without
 * reconstructing storage or domain policy.
 */
export type SiteDetailsView = {
  isWaveDriven: boolean;
  hasResources: boolean;
  isGas: boolean;
  hasWaves: boolean;
  sectionLabel: string;
  sectionHint: string;
  footerLabel: string;
};

/**
 * Which blocks the expanded body renders and with what copy: wave-driven sites
 * (combat / hackable) lead with wave cards, gathering sites show a resource
 * section; a resource-less site still gets its (possibly empty) wave section.
 */
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
