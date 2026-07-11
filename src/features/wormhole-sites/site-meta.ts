import type { SiteDetail } from './types';

// Abbreviated ISK for the meta description prose. Kept local (not the shared
// lib formatters) because the SEO copy wants this exact shape — a trailing
// " ISK" and this precision — and drifting it would change every page's
// description text.
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

/**
 * Unique, descriptive meta description per site — built from the site's own
 * data so no two of the 69 pages share a generic snippet. Resource sites lead
 * with their harvestables and live value; wave-driven sites lead with loot +
 * waves.
 */
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

/**
 * Page `<title>` + meta description for a site detail page. The title reads
 * "Name — Class Type" (falling back to "Name — Type", and gas sites without a
 * stored class read "Wormhole Gas").
 */
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
