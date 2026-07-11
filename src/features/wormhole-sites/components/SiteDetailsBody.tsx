import { Callout } from '@/components/ui/callout';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { displayableResources } from '../resource-display';
import type { SiteDetail } from '../types';
import { NpcNameColScope } from './NpcNameColScope';
import { SiteResourcesLive } from './SiteResourcesLive';
import { WaveCard } from './WaveCard';
import { deriveSiteDetailsView, type SiteDetailsView } from './site-details-view';

function WaveCards({ waves }: { waves: SiteDetail['waves'] }) {
  return (
    <>
      {waves.map((wave) => (
        <WaveCard key={wave.id} wave={wave} defaultOpen={true} />
      ))}
    </>
  );
}

function ResourceSection({ site, view }: { site: SiteDetail; view: SiteDetailsView }) {
  if (!view.hasResources) return null;
  return (
    <>
      <SectionHeader label={view.sectionLabel} hint={view.sectionHint} />
      {view.isGas && <Callout label="Spawn">Sleeper wave arrives ~20 min after warp-in</Callout>}
      <SiteResourcesLive
        resources={displayableResources(site.resources)}
        siteType={site.siteType}
        footerLabel={view.footerLabel}
      />
    </>
  );
}

function NoWaveSection({ site, view }: { site: SiteDetail; view: SiteDetailsView }) {
  if (view.isWaveDriven) return null;
  return (
    <>
      <SectionHeader label="Wave Spawns" />
      {view.hasWaves ? (
        <WaveCards waves={site.waves} />
      ) : (
        <EmptyState>No Sleeper presence — mine freely</EmptyState>
      )}
    </>
  );
}

/**
 * The expanded body for a wormhole site — everything that appears inside the
 * `<details>` element. Shared between the card view (SiteCard) and the table view
 * (SitesTable row), so both surfaces expose identical detail.
 */
export function SiteDetailsBody({ site }: { site: SiteDetail }) {
  const view = deriveSiteDetailsView(site);

  return (
    <NpcNameColScope>
      {view.isWaveDriven && <WaveCards waves={site.waves} />}
      <ResourceSection site={site} view={view} />
      <NoWaveSection site={site} view={view} />
    </NpcNameColScope>
  );
}
