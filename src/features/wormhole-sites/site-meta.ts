import { formatIskCompact } from '@/lib/format/isk';
import { formatCount } from '@/lib/format/number';
import { SITE_TYPE_LABEL } from './components/wormhole-styles';
import type { SiteDetail } from './types';

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
      loot > 0
        ? `${formatIskCompact(loot, { unit: true })} estimated blue-loot value`
        : 'sleeper loot';
    const waves = site.waves.length;
    const waveText = waves > 0 ? `, ${formatCount(waves, 'NPC wave')}` : '';
    return `${site.name} is a ${kind} in Eve Online wormhole space — ${lootText}${waveText}, with full NPC and EWAR stats.`;
  }

  const names = site.resources.slice(0, 3).map((r) => r.resourceName);
  const resourceText = names.length > 0 ? names.join(', ') : 'its resources';
  const total = site.resourceValueIsk ?? 0;
  const totalText =
    total > 0 ? ` — ${formatIskCompact(total, { unit: true })} at live Jita prices` : '';
  return `${site.name} is a ${kind} in Eve Online wormhole space. Live Jita prices on ${resourceText}${totalText}, updated hourly.`;
}

export function deriveSiteMeta(site: SiteDetail): {
  typeLabel: string;
  classLabel: string | null;
  title: string;
  description: string;
} {
  const typeLabel = SITE_TYPE_LABEL[site.siteType];
  const classLabel = site.wormholeClass ?? (site.siteType === 'gas' ? 'Wormhole' : null);
  const title = [site.name, classLabel ? `${classLabel} ${typeLabel}` : typeLabel]
    .filter(Boolean)
    .join(' — ');
  const description = buildSiteDescription(site, typeLabel, classLabel);
  return { typeLabel, classLabel, title, description };
}
