import { Card, CardHeader } from '@/components/ui/card';
import { MetricBlock } from '@/components/ui/metric-block';
import { Pill } from '@/components/ui/pill';
import type { SiteDetail } from '../types';
import { ResourcePreview } from './ResourcePreview';
import { SiteDetailsBody, formatIskHeader } from './SiteDetailsBody';
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
  const hasResources = site.resources.length > 0;
  const isCombat = site.siteType === 'combat';
  const isHackSite = site.siteType === 'relic' || site.siteType === 'data';
  const isWaveDriven = isCombat || isHackSite;

  const primaryIsk = isWaveDriven ? site.blueLootIsk : site.resourceValueIsk;
  const killingWaveIsk = !isWaveDriven && hasWaves ? site.blueLootIsk : null;

  // Density vocabulary — see docs/wireframes/sites-density.html and the
  // matching CSS rules in globals.css. Ore + gas cards opt into the hover
  // glow + ResourcePreview overlay; combat / relic / data stay flat.
  const cardVariant = isWaveDriven ? 'wave-driven' : 'resource';

  return (
    <Card className={`card ${cardVariant}`}>
      {!isWaveDriven && hasResources && <ResourcePreview site={site} />}
      <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none">
          <CardHeader
            title={site.name}
            meta={
              <>
                <Pill tone="neutral">{SCAN_PILL_LABEL[SITE_TYPE_SCAN[site.siteType]]}</Pill>
                <Pill tone={SITE_TYPE_TONE[site.siteType]}>{SITE_TYPE_LABEL[site.siteType]}</Pill>
                {site.wormholeClass && (
                  <Pill tone={CLASS_TONE[site.wormholeClass]}>{site.wormholeClass}</Pill>
                )}
              </>
            }
            trailing={
              <MetricBlock
                value={formatIskHeader(primaryIsk)}
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
    </Card>
  );
}
