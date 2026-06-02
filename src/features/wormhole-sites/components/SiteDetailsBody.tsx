import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { displayableResources } from '../resource-display';
import type { SiteDetail } from '../types';
import { EwarRow } from './EwarRow';
import { SiteResourcesLive } from './SiteResourcesLive';
import { WaveCard } from './WaveCard';

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
          <SiteResourcesLive
            resources={displayableResources(site.resources)}
            siteType={site.siteType}
            footerLabel={resourceFooterLabel(site.siteType)}
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
