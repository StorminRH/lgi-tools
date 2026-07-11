import { Pill } from '@/components/ui/pill';
import { displayableResources } from '../resource-display';
import type { SiteDetail, SiteResource } from '../types';
import { SiteHeaderTotal } from './SiteResourcesLive';
import { SiteShipClasses } from './SiteShipClasses';
import { deriveSiteCardHeaderView, type SiteCardHeaderView } from './site-card-header-view';

// The headline value: the blue-loot ISK figure for wave-driven sites, or the
// live resource total for gathering sites.
function SiteCardValue({
  view,
  resources,
}: {
  view: SiteCardHeaderView;
  resources: SiteResource[];
}) {
  if (!view.isWaveDriven) {
    return <SiteHeaderTotal resources={resources} />;
  }
  return (
    <>
      {view.waveValue}
      {view.showIskUnit && <i>ISK</i>}
    </>
  );
}

/**
 * The card's collapsed-summary content: title · value, an optional sub-line, the
 * class/type/EWAR pills, and the NPC hull-class strip (the reads live in
 * {@link deriveSiteCardHeaderView}). Factored out of `SiteCard` so it renders
 * identically in the in-place `<summary>` and inside the lightbox overlay.
 * Directive-less: server-prerendered into the static shell when the summary
 * renders it, and client-bundled when the lightbox island renders it. `nameId`
 * labels the lightbox dialog — pass it only for the lightbox copy so the summary
 * copy doesn't emit a duplicate id.
 */
export function SiteCardHeader({ site, nameId }: { site: SiteDetail; nameId?: string }) {
  const liveResources = displayableResources(site.resources);
  const view = deriveSiteCardHeaderView(site, liveResources);

  return (
    <>
      <div className="sites-card-top">
        <span className="sites-card-name" id={nameId}>
          {site.name}
        </span>
        <span className="sites-card-val">
          <SiteCardValue view={view} resources={liveResources} />
        </span>
      </div>
      {view.subLine && <div className="sites-card-sub">{view.subLine}</div>}
      <div className="sites-card-pills">
        {view.classPill && <Pill tone={view.classPill.tone}>{view.classPill.label}</Pill>}
        <Pill tone={view.typePill.tone}>{view.typePill.label}</Pill>
        {view.ewarPills.map((p) => (
          <Pill key={p.key} tone={p.tone}>
            {p.label}
          </Pill>
        ))}
      </div>
      <SiteShipClasses site={site} />
    </>
  );
}
