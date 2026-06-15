import { Pill } from '@/components/ui/pill';
import { formatClassRange, gasClassRange } from '../gas-classes';
import { formatIsk } from '../format';
import { displayableResources } from '../resource-display';
import type { SiteDetail, SiteResource } from '../types';
import { SiteDetailsBody } from './SiteDetailsBody';
import { SiteHeaderTotal, SiteLiveProvider } from './SiteResourcesLive';
import { CLASS_TONE, SITE_TYPE_LABEL, SITE_TYPE_TONE } from './wormhole-styles';

// Peak incoming DPS (the hardest single wave) and the total EHP to clear the
// whole site — the at-a-glance combat read for the card sub-line. Both derive
// live from the SDE-computed wave stats.
function combatSubLine(site: SiteDetail): string {
  const peakDps = site.waves.reduce((m, w) => Math.max(m, w.dpsTotal), 0);
  const totalEhp = site.waves.reduce((n, w) => n + w.ehpTotal, 0);
  return `DPS ${peakDps.toLocaleString('en-US')} · EHP ${Math.round(totalEhp / 1000).toLocaleString('en-US')}k — SDE-computed`;
}

// Ore / gas / hackable-container names, for non-combat sites.
function resourceSubLine(resources: SiteResource[]): string | null {
  const names = resources.map((r) => r.resourceName).filter(Boolean);
  return names.length > 0 ? names.join(' · ') : null;
}

/**
 * Top-level card renderer for a single SiteDetail. Owns the card chrome and the
 * collapsed summary (title · value, a sub-line, and the class + type pills); the
 * expanded body (EwarRow, waves, resources) lives in the shared
 * `SiteDetailsBody` so the table view can render identical detail. The
 * `<details>` element keeps the expand-in-place behaviour; live ore/gas prices
 * stream into the summary total and the body from one `SiteLiveProvider`.
 */
export function SiteCard({
  site,
  defaultOpen = false,
}: {
  site: SiteDetail;
  defaultOpen?: boolean;
}) {
  const isCombat = site.siteType === 'combat';
  const isWaveDriven = isCombat || site.siteType === 'relic' || site.siteType === 'data';
  const liveResources = displayableResources(site.resources);

  const subLine = isCombat ? combatSubLine(site) : resourceSubLine(liveResources);
  const waveValue = formatIsk(site.blueLootIsk);

  const classPill = site.wormholeClass ? (
    <Pill tone={CLASS_TONE[site.wormholeClass]}>{site.wormholeClass}</Pill>
  ) : site.siteType === 'gas' ? (
    (() => {
      const range = gasClassRange(site.name);
      return range ? <Pill tone={CLASS_TONE[range.min]}>{formatClassRange(range)}</Pill> : null;
    })()
  ) : null;

  return (
    <div className="sites-card">
      <SiteLiveProvider resources={liveResources}>
        <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
          <summary className="sites-card-summary list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none">
            <div className="sites-card-top">
              <span className="sites-card-name">{site.name}</span>
              <span className="sites-card-val">
                {isWaveDriven ? (
                  <>
                    {waveValue}
                    {site.blueLootIsk != null && <i>ISK</i>}
                  </>
                ) : (
                  <SiteHeaderTotal resources={liveResources} />
                )}
              </span>
            </div>
            {subLine && <div className="sites-card-sub">{subLine}</div>}
            <div className="sites-card-pills">
              {classPill}
              <Pill tone={SITE_TYPE_TONE[site.siteType]}>{SITE_TYPE_LABEL[site.siteType]}</Pill>
            </div>
          </summary>

          <SiteDetailsBody site={site} />
        </details>
      </SiteLiveProvider>
    </div>
  );
}
