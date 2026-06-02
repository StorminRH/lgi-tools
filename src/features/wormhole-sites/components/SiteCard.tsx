import { Card, CardHeader } from '@/components/ui/card';
import { MetricBlock } from '@/components/ui/metric-block';
import { Pill } from '@/components/ui/pill';
import { formatClassRange, gasClassRange } from '../gas-classes';
import { formatIskHeader } from '../format';
import { displayableResources } from '../resource-display';
import type { SiteDetail } from '../types';
import { SiteDetailsBody } from './SiteDetailsBody';
import { SiteHeaderTotal, SiteLiveProvider } from './SiteResourcesLive';
import {
  CLASS_TONE,
  SCAN_PILL_LABEL,
  SITE_TYPE_LABEL,
  SITE_TYPE_SCAN,
  SITE_TYPE_TONE,
} from './wormhole-styles';

/**
 * Top-level card renderer for a single SiteDetail. Owns the card chrome and
 * the summary row; the expanded body (EwarRow, waves, resources) lives in
 * the shared `SiteDetailsBody` so the new table view can render identical
 * detail without duplicating JSX.
 */
export function SiteCard({
  site,
  defaultOpen = false,
}: {
  site: SiteDetail;
  defaultOpen?: boolean;
}) {
  const hasWaves = site.waves.length > 0;
  const isCombat = site.siteType === 'combat';
  const isHackSite = site.siteType === 'relic' || site.siteType === 'data';
  const isWaveDriven = isCombat || isHackSite;

  const primaryIsk = isWaveDriven ? site.blueLootIsk : site.resourceValueIsk;
  const killingWaveIsk = !isWaveDriven && hasWaves ? site.blueLootIsk : null;
  // The same set the body shows + sums, so the header total can never disagree
  // with the footer or the visible rows.
  const liveResources = displayableResources(site.resources);

  // Density vocabulary — see docs/wireframes/sites-density.html and the
  // matching CSS rules in globals.css. Ore + gas cards get a subtle hover
  // glow; combat / relic / data stay flat.
  const cardVariant = isWaveDriven ? 'wave-driven' : 'resource';

  return (
    <Card className={`card ${cardVariant}`}>
      <SiteLiveProvider resources={liveResources}>
      <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none">
          <CardHeader
            title={site.name}
            meta={
              <>
                <Pill tone="neutral">{SCAN_PILL_LABEL[SITE_TYPE_SCAN[site.siteType]]}</Pill>
                <Pill tone={SITE_TYPE_TONE[site.siteType]}>{SITE_TYPE_LABEL[site.siteType]}</Pill>
                {site.wormholeClass ? (
                  <Pill tone={CLASS_TONE[site.wormholeClass]}>{site.wormholeClass}</Pill>
                ) : site.siteType === 'gas' ? (
                  (() => {
                    const range = gasClassRange(site.name);
                    return range ? (
                      <Pill tone={CLASS_TONE[range.min]}>{formatClassRange(range)}</Pill>
                    ) : null;
                  })()
                ) : null}
              </>
            }
            trailing={
              <MetricBlock
                value={
                  isWaveDriven ? (
                    formatIskHeader(primaryIsk)
                  ) : (
                    <SiteHeaderTotal resources={liveResources} />
                  )
                }
                sub={
                  isWaveDriven ? (
                    'est. loot'
                  ) : killingWaveIsk ? (
                    <>
                      +<span className="text-[#4a7860]">{formatIskHeader(killingWaveIsk).replace(' ISK', '')}</span> blue loot
                    </>
                  ) : (
                    'no blue loot'
                  )
                }
              />
            }
          />
        </summary>

        <SiteDetailsBody site={site} />
      </details>
      </SiteLiveProvider>
    </Card>
  );
}
