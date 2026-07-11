import type { ChipTone, PillTone } from '@/components/ui/tones';
import { formatClassRange, gasClassRange } from '../gas-classes';
import { formatIsk } from '../format';
import type { SiteDetail, SiteResource } from '../types';
import {
  CLASS_TONE,
  EWAR_LABEL,
  EWAR_ORDER,
  EWAR_TONE,
  SITE_TYPE_LABEL,
  SITE_TYPE_TONE,
  type EwarKey,
} from './wormhole-styles';

// Peak incoming DPS (the hardest single wave) and the total EHP to clear the
// whole site — the at-a-glance combat read for the card sub-line.
function combatSubLine(site: SiteDetail): string {
  const peakDps = site.waves.reduce((m, w) => Math.max(m, w.dpsTotal), 0);
  const totalEhp = site.waves.reduce((n, w) => n + w.ehpTotal, 0);
  return `DPS ${peakDps.toLocaleString('en-US')} · EHP ${Math.round(totalEhp / 1000).toLocaleString('en-US')}k`;
}

// Ore / gas / hackable-container names, for non-combat sites.
function resourceSubLine(resources: SiteResource[]): string | null {
  const names = resources.map((r) => r.resourceName).filter(Boolean);
  return names.length > 0 ? names.join(' · ') : null;
}

// EWAR fielded anywhere across the site's waves → the pills shown in the collapsed
// card preview. Summed across waves; a type appears if any wave fields it.
function activeSiteEwar(site: SiteDetail): EwarKey[] {
  const counts: Record<EwarKey, number> = {
    web:   site.waves.reduce((n, w) => n + (w.ewWeb   ?? 0), 0),
    scram: site.waves.reduce((n, w) => n + (w.ewScram ?? 0), 0),
    neut:  site.waves.reduce((n, w) => n + (w.ewNeut  ?? 0), 0),
    rr:    site.waves.reduce((n, w) => n + (w.ewRrep  ?? 0), 0),
  };
  return EWAR_ORDER.filter((k) => counts[k] !== 0);
}

// The class pill: the wormhole class when known, else a gas site's parsed class
// range, else nothing.
function deriveClassPill(site: SiteDetail): { tone: PillTone; label: string } | null {
  if (site.wormholeClass) {
    return { tone: CLASS_TONE[site.wormholeClass], label: site.wormholeClass };
  }
  if (site.siteType === 'gas') {
    const range = gasClassRange(site.name);
    return range ? { tone: CLASS_TONE[range.min], label: formatClassRange(range) } : null;
  }
  return null;
}

export type SiteCardHeaderView = {
  subLine: string | null;
  waveValue: string;
  showIskUnit: boolean;
  isWaveDriven: boolean;
  classPill: { tone: PillTone; label: string } | null;
  typePill: { tone: PillTone; label: string };
  ewarPills: { key: EwarKey; tone: ChipTone; label: string }[];
};

// The card's collapsed-summary content, computed from the site + its displayable
// resources: the value read, the class/type/EWAR pill configs, and the sub-line.
export function deriveSiteCardHeaderView(
  site: SiteDetail,
  liveResources: SiteResource[],
): SiteCardHeaderView {
  const isCombat = site.siteType === 'combat';
  return {
    subLine: isCombat ? combatSubLine(site) : resourceSubLine(liveResources),
    waveValue: formatIsk(site.blueLootIsk),
    showIskUnit: site.blueLootIsk != null,
    isWaveDriven: isCombat || site.siteType === 'relic' || site.siteType === 'data',
    classPill: deriveClassPill(site),
    typePill: { tone: SITE_TYPE_TONE[site.siteType], label: SITE_TYPE_LABEL[site.siteType] },
    ewarPills: activeSiteEwar(site).map((key) => ({
      key,
      tone: EWAR_TONE[key],
      label: EWAR_LABEL[key],
    })),
  };
}
