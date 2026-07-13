import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { displayableResources } from '../resource-display';
import type { SiteDetail } from '../types';
import { LazySiteDetails } from './LazySiteDetails';
import { SiteCardHeader } from './SiteCardHeader';
import { SiteCardLightbox } from './SiteCardLightbox';
import { SiteDetailsBody } from './SiteDetailsBody';
import { SiteLiveProvider } from './SiteResourcesLive';

function CatalogueCardExtras({ site }: { site: SiteDetail }) {
  return (
    <>
      <div className="border-t border-border-idle px-3 py-2 text-right">
        <Link
          href={`/sites/${site.id}`}
          className="font-mono text-label tracking-label uppercase text-muted hover:text-name"
        >
          View full page →
        </Link>
      </div>
      <SiteCardLightbox site={site} />
    </>
  );
}

/**
 * Top-level card renderer for a single SiteDetail. Owns the card chrome and the
 * collapsed summary (the shared `SiteCardHeader`); the expanded body (EwarRow,
 * waves, resources) lives in `SiteDetailsBody` so the table view and the lightbox
 * render identical detail. The `<details>` element keeps the in-place expand
 * (`expand` mode); `SiteCardLightbox` — a sibling so its dialog isn't hidden by
 * the collapsed `<details>` — provides the centred overlay (`lightbox` mode). Live
 * ore/gas prices stream into the summary total and the body from one
 * `SiteLiveProvider`. On `/sites/[id]` (`defaultOpen`) the body renders inline,
 * server-side, with no lightbox.
 */
export function SiteCard({
  site,
  defaultOpen = false,
}: {
  site: SiteDetail;
  defaultOpen?: boolean;
}) {
  const liveResources = displayableResources(site.resources);

  return (
    // `data-site-card` is the lightbox's DOM hook (it walks from the summary up to
    // this element, then down to the <details>); `font="body"` keeps the card's
    // Geist prose, `hover` the catalogue glow.
    <Card font="body" hover data-site-card>
      <SiteLiveProvider resources={liveResources}>
        <details data-collapsible {...(defaultOpen ? { open: true } : {})}>
          <summary className="sites-card-summary list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none">
            <SiteCardHeader site={site} />
          </summary>

          {defaultOpen ? (
            <SiteDetailsBody site={site} />
          ) : (
            <LazySiteDetails site={site} zoom />
          )}
        </details>
        {!defaultOpen && <CatalogueCardExtras site={site} />}
      </SiteLiveProvider>
    </Card>
  );
}
