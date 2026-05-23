import { Card, CardHeader } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { MetricBlock } from '@/components/ui/metric-block';
import { SectionHeader } from '@/components/ui/section-header';
import { SectionFooter } from '@/components/ui/section-footer';
import { EmptyState } from '@/components/ui/empty-state';
import { Callout } from '@/components/ui/callout';
import type { SiteDetail } from '../types';
import {
  CLASS_TONE,
  SCAN_PILL_LABEL,
  SITE_TYPE_LABEL,
  SITE_TYPE_SCAN,
  SITE_TYPE_TONE,
} from './wormhole-styles';
import { EwarRow } from './EwarRow';
import { WaveCard } from './WaveCard';
import { ResourceRow } from './ResourceRow';

function formatIskHeader(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B ISK`;
  return `${(isk / 1_000_000).toFixed(1)}M ISK`;
}

/**
 * Top-level renderer for a single SiteDetail. Composes UI primitives
 * via wormhole-styles mappings; no styling decisions live here beyond
 * which sub-sections to show for each site type.
 */
export function SiteCard({ site }: { site: SiteDetail }) {
  const hasWaves = site.waves.length > 0;
  const hasResources = site.resources.length > 0;
  const isCombat = site.siteType === 'combat';
  const isHackSite = site.siteType === 'relic' || site.siteType === 'data';
  const isGas = site.siteType === 'gas';

  // Combine all per-wave EWAR flags so the site-level EWAR row reflects
  // every kind of ewar the player will face anywhere in this site.
  const siteEwar = {
    web:   site.waves.reduce((n, w) => n + (w.ewWeb   ?? 0), 0),
    scram: site.waves.reduce((n, w) => n + (w.ewScram ?? 0), 0),
    neut:  site.waves.reduce((n, w) => n + (w.ewNeut  ?? 0), 0),
    rr:    site.waves.reduce((n, w) => n + (w.ewRrep  ?? 0), 0),
  };

  const primaryIsk = isCombat ? site.blueLootIsk : site.resourceValueIsk;
  const killingWaveIsk = !isCombat && hasWaves ? site.blueLootIsk : null;

  const totalResourceIsk = site.resources.reduce(
    (sum, r) => sum + (r.totalIsk ?? 0),
    0,
  );

  return (
    <Card>
      <details data-collapsible>
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
                  isCombat ? (
                    'est. loot'
                  ) : killingWaveIsk ? (
                    <>
                      +<span className="text-[#4a7860]">{formatIskHeader(killingWaveIsk).replace(' ISK', '')}</span> killing wave
                    </>
                  ) : (
                    'no combat wave'
                  )
                }
              />
            }
          />
        </summary>

        <EwarRow web={siteEwar.web} scram={siteEwar.scram} neut={siteEwar.neut} rr={siteEwar.rr} />

        {isCombat &&
          site.waves.map((wave) => (
            <WaveCard key={wave.id} wave={wave} defaultOpen={true} />
          ))}

        {hasResources && (
          <>
            <SectionHeader
              label={resourceSectionLabel(site.siteType)}
              hint={resourceSectionHint(site.siteType)}
            />
            {isGas && (
              <Callout label="Spawn">Sleeper wave arrives ~20 min after warp-in</Callout>
            )}
            {site.resources
              .filter((r) => r.resourceKind !== 'ore' || (r.units ?? 0) > 0)
              .map((resource) => (
                <ResourceRow key={resource.id} resource={resource} siteType={site.siteType} />
              ))}
            <SectionFooter
              label={resourceFooterLabel(site.siteType)}
              value={formatIskHeader(totalResourceIsk)}
            />
          </>
        )}

        {!isCombat && (
          <>
            <SectionHeader label="Wave Spawns" />
            {hasWaves ? (
              site.waves.map((wave) => (
                <WaveCard key={wave.id} wave={wave} defaultOpen={true} />
              ))
            ) : (
              <EmptyState>
                {isHackSite
                  ? 'No Sleeper presence — hacking only'
                  : 'No Sleeper presence — mine freely'}
              </EmptyState>
            )}
          </>
        )}
      </details>
    </Card>
  );
}

function resourceSectionLabel(type: SiteDetail['siteType']): string {
  switch (type) {
    case 'ore':   return 'Ore Deposits';
    case 'gas':   return 'Gas Clouds';
    case 'relic':
    case 'data':  return 'Hackable Containers';
    default:      return 'Resources';
  }
}

function resourceSectionHint(type: SiteDetail['siteType']): string {
  switch (type) {
    case 'ore':   return 'qty · m³ · est. ISK';
    case 'gas':   return 'm³ · est. ISK';
    case 'relic':
    case 'data':  return 'est. ISK per can';
    default:      return '';
  }
}

function resourceFooterLabel(type: SiteDetail['siteType']): string {
  switch (type) {
    case 'ore':   return 'Total ore value';
    case 'gas':   return 'Total gas value';
    case 'relic':
    case 'data':  return 'Total container value';
    default:      return 'Total value';
  }
}
