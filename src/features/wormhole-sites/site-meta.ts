import type { SiteDetail } from './types';

function formatIsk(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B ISK`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M ISK`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K ISK`;
  return `${value} ISK`;
}

const SITE_TYPE_LABEL: Record<string, string> = {
  combat: 'Combat',
  ore: 'Ore',
  gas: 'Gas',
  relic: 'Relic',
  data: 'Data',
};

export function buildSiteDescription(
  site: SiteDetail,
  typeLabel: string,
  classLabel: string | null,
): string {
  const kind = `${classLabel ? `${classLabel} ` : ''}${typeLabel.toLowerCase()} site`;
  const isWaveDriven =
    site.siteType === 'combat' || site.siteType === 'relic' || site.siteType === 'data';

  if (isWaveDriven) {
    const loot = site.blueLootIsk ?? 0;
    const lootText =
      loot > 0 ? `${formatIsk(loot)} estimated blue-loot value` : 'sleeper loot';
    const waves = site.waves.length;
    const waveText = waves > 0 ? `, ${waves} NPC wave${waves === 1 ? '' : 's'}` : '';
    return `${site.name} is a ${kind} in Eve Online wormhole space — ${lootText}${waveText}, with full NPC and EWAR stats.`;
  }

  const names = site.resources.slice(0, 3).map((r) => r.resourceName);
  const resourceText = names.length > 0 ? names.join(', ') : 'its resources';
  const total = site.resourceValueIsk ?? 0;
  const totalText = total > 0 ? ` — ${formatIsk(total)} at live Jita prices` : '';
  return `${site.name} is a ${kind} in Eve Online wormhole space. Live Jita prices on ${resourceText}${totalText}, updated hourly.`;
}

export function deriveSiteMeta(site: SiteDetail): {
  typeLabel: string;
  classLabel: string | null;
  title: string;
  description: string;
} {
  const typeLabel = SITE_TYPE_LABEL[site.siteType] ?? site.siteType;
  const classLabel = site.wormholeClass ?? (site.siteType === 'gas' ? 'Wormhole' : null);
  const title = [site.name, classLabel ? `${classLabel} ${typeLabel}` : typeLabel]
    .filter(Boolean)
    .join(' — ');
  const description = buildSiteDescription(site, typeLabel, classLabel);
  return { typeLabel, classLabel, title, description };
}
