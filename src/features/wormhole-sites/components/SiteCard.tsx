import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
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
          className="text-label tracking-label uppercase text-muted hover:text-name"
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
 * render identical detail. Catalogue presentation keeps the `<details>` expand
 * and sibling lightbox; standalone presentation renders header + body inline —
 * always expanded, no collapse toggle, no hover glow — for `/sites/[id]` and
 * embedded viewers. Live ore/gas prices stream into the summary total and the
 * body from one `SiteLiveProvider`. Hover is owned by presentation, not
 * alignment (`contentAlign` only lays out the header).
 */
export function SiteCard({
  site,
  className,
  contentAlign = 'start',
  presentation = 'catalogue',
}: {
  site: SiteDetail;
  /** Extra surface classes — map embeds clear the nested solid card fill. */
  className?: string;
  /** Map dock centers the summary stack; catalogue cards stay start-aligned. */
  contentAlign?: 'start' | 'center';
  /** Standalone always-expanded presentation for the full page and embedded viewers. */
  presentation?: 'catalogue' | 'standalone';
}) {
  const liveResources = displayableResources(site.resources);
  const centered = contentAlign === 'center';
  const standalone = presentation === 'standalone';
  const header = <SiteCardHeader site={site} align={contentAlign} />;
  // Collapsible's summary already supplies `flex`; standalone's plain header needs it.
  const headerLayoutClassName = centered
    ? 'flex-col items-center gap-2 px-3 pb-3 pt-3 text-center'
    : 'flex-col items-stretch gap-2 px-[17px] pb-[13px] pt-[15px]';

  return (
    // `data-site-card` is the lightbox's DOM hook (it walks from the summary up to
    // this element, then down to the <details>); `font="ui"` states the prose role.
    <Card
      font="ui"
      hover={!standalone}
      data-site-card
      data-presentation={presentation}
      className={className}
    >
      <SiteLiveProvider resources={liveResources}>
        {standalone ? (
          <>
            <div className={cn('flex', headerLayoutClassName)}>{header}</div>
            <SiteDetailsBody site={site} />
          </>
        ) : (
          <>
            <Collapsible
              className="border-b-0"
              headerClassName={headerLayoutClassName}
              header={header}
            >
              <LazySiteDetails site={site} zoom />
            </Collapsible>
            <CatalogueCardExtras site={site} />
          </>
        )}
      </SiteLiveProvider>
    </Card>
  );
}
