import type { PillTone } from '@/components/ui/tones';
import { formatIskShort } from '@/lib/format/isk';
import { formatQuantity } from '@/lib/format/number';
import { activeEwarKeys, siteEwarTotals, type EwarKey } from '../ewar';
import { isWaveDrivenSiteType } from '../site-type';
import type { SiteDetail, SiteResource } from '../types';
import {
  EWAR_LABEL,
  EWAR_TONE,
  SITE_TYPE_LABEL,
  SITE_TYPE_TONE,
  siteClassPill,
} from './wormhole-styles';

function combatSubLine(site: SiteDetail): string {
  const peakDps = site.waves.reduce((m, w) => Math.max(m, w.dpsTotal), 0);
  const totalEhp = site.waves.reduce((n, w) => n + w.ehpTotal, 0);
  return `DPS ${formatQuantity(peakDps)} · EHP ${formatQuantity(totalEhp / 1000)}k`;
}

function resourceSubLine(resources: SiteResource[]): string | null {
  const names = resources.map((r) => r.resourceName).filter(Boolean);
  return names.length > 0 ? names.join(' · ') : null;
}

export type SiteCardHeaderView = {
  subLine: string | null;
  waveValue: string;
  showIskUnit: boolean;
  isWaveDriven: boolean;
  classPill: { tone: PillTone; label: string } | null;
  typePill: { tone: PillTone; label: string };
  ewarPills: { key: EwarKey; tone: PillTone; label: string }[];
};

export function deriveSiteCardHeaderView(
  site: SiteDetail,
  liveResources: SiteResource[],
): SiteCardHeaderView {
  const isCombat = site.siteType === 'combat';
  return {
    subLine: isCombat ? combatSubLine(site) : resourceSubLine(liveResources),
    waveValue: formatIskShort(site.blueLootIsk),
    showIskUnit: site.blueLootIsk != null,
    isWaveDriven: isWaveDrivenSiteType(site.siteType),
    classPill: siteClassPill(site),
    typePill: { tone: SITE_TYPE_TONE[site.siteType], label: SITE_TYPE_LABEL[site.siteType] },
    ewarPills: activeEwarKeys(siteEwarTotals(site)).map((key) => ({
      key,
      tone: EWAR_TONE[key],
      label: EWAR_LABEL[key],
    })),
  };
}
