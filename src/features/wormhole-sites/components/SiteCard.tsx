import { Pill } from '@/components/ui/pill';
import { formatClassRange, gasClassRange } from '../gas-classes';
import { formatIsk } from '../format';
import { displayableResources } from '../resource-display';
import type { SiteDetail, SiteResource } from '../types';
import { LazySiteDetails } from './LazySiteDetails';
import { SiteDetailsBody } from './SiteDetailsBody';
import { SiteHeaderTotal, SiteLiveProvider } from './SiteResourcesLive';
import { SiteShipClasses } from './SiteShipClasses';
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
// whole site — the at-a-glance combat read for the card sub-line. Both derive
// live from the SDE-computed wave stats.
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

// EWAR fielded anywhere across the site's waves → the pills shown in the
// collapsed card preview alongside the class + type pills. Summed across
// waves; a type appears if any wave fields it.
function activeSiteEwar(site: SiteDetail): EwarKey[] {
  const counts: Record<EwarKey, number> = {
    web:   site.waves.reduce((n, w) => n + (w.ewWeb   ?? 0), 0),
    scram: site.waves.reduce((n, w) => n + (w.ewScram ?? 0), 0),
    neut:  site.waves.reduce((n, w) => n + (w.ewNeut  ?? 0), 0),
    rr:    site.waves.reduce((n, w) => n + (w.ewRrep  ?? 0), 0),
  };
  return EWAR_ORDER.filter((k) => counts[k] !== 0);
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
  const ewarKeys = activeSiteEwar(site);

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
              {ewarKeys.map((k) => (
                <Pill key={k} tone={EWAR_TONE[k]}>
                  {EWAR_LABEL[k]}
                </Pill>
              ))}
            </div>
            <SiteShipClasses site={site} />
          </summary>

          {defaultOpen ? (
            <SiteDetailsBody site={site} />
          ) : (
            <LazySiteDetails site={site} />
          )}
        </details>
      </SiteLiveProvider>
    </div>
  );
}
