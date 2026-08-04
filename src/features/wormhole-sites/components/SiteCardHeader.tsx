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
export function SiteCardHeader({
  site,
  nameId,
  align = 'start',
}: {
  site: SiteDetail;
  nameId?: string;
  /** Map-dock embeds center the summary stack; catalogue cards stay start-aligned. */
  align?: 'start' | 'center';
}) {
  const liveResources = displayableResources(site.resources);
  const view = deriveSiteCardHeaderView(site, liveResources);
  const centered = align === 'center';

  return (
    <>
      <div
        className={
          centered
            ? 'flex flex-col items-center gap-1'
            : 'flex items-baseline justify-between gap-3'
        }
      >
        <span className="min-w-0 text-lead font-bold leading-[1.15] tracking-optical text-name" id={nameId}>
          {site.name}
        </span>
        <span className="whitespace-nowrap text-ui font-semibold tabular-nums text-isk [&_i]:ml-0.5 [&_i]:text-micro [&_i]:not-italic [&_i]:text-muted">
          <SiteCardValue view={view} resources={liveResources} />
        </span>
      </div>
      {view.subLine && <div className="text-micro tracking-[0.04em] text-muted">{view.subLine}</div>}
      <div
        className={
          centered
            ? 'mt-0.5 flex flex-wrap items-center justify-center gap-1'
            : 'mt-0.5 flex flex-wrap items-center gap-1'
        }
      >
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
