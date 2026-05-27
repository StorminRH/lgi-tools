import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionFooter } from '@/components/ui/section-footer';
import { SectionHeader } from '@/components/ui/section-header';
import type { SiteDetail } from '../types';
import { EwarRow } from './EwarRow';
import { ResourceRow } from './ResourceRow';
import { WaveCard } from './WaveCard';

export function formatIskHeader(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B ISK`;
  return `${(isk / 1_000_000).toFixed(1)}M ISK`;
}

/**
 * The expanded body for a wormhole site — everything that appears inside
 * the `<details>` element. Shared between the card view (SiteCard) and the
 * table view (SitesTable row), so both surfaces expose identical detail.
 */
export function SiteDetailsBody({ site }: { site: SiteDetail }) {
  const hasWaves = site.waves.length > 0;
  const hasResources = site.resources.length > 0;
  const isCombat = site.siteType === 'combat';
  const isHackSite = site.siteType === 'relic' || site.siteType === 'data';
  const isGas = site.siteType === 'gas';
  const isWaveDriven = isCombat || isHackSite;

  const siteEwar = {
    web:   site.waves.reduce((n, w) => n + (w.ewWeb   ?? 0), 0),
    scram: site.waves.reduce((n, w) => n + (w.ewScram ?? 0), 0),
    neut:  site.waves.reduce((n, w) => n + (w.ewNeut  ?? 0), 0),
    rr:    site.waves.reduce((n, w) => n + (w.ewRrep  ?? 0), 0),
  };

  const totalResourceIsk = site.resources.reduce(
    (sum, r) => sum + (r.effectiveIsk ?? 0),
    0,
  );

  return (
    <>
      <EwarRow web={siteEwar.web} scram={siteEwar.scram} neut={siteEwar.neut} rr={siteEwar.rr} />

      {isWaveDriven &&
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

      {!isWaveDriven && (
        <>
          <SectionHeader label="Wave Spawns" />
          {hasWaves ? (
            site.waves.map((wave) => (
              <WaveCard key={wave.id} wave={wave} defaultOpen={true} />
            ))
          ) : (
            <EmptyState>No Sleeper presence — mine freely</EmptyState>
          )}
        </>
      )}
    </>
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
