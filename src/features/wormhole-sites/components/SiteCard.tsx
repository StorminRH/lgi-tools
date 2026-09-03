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

export function SiteCard({
  site,
  className,
  contentAlign = 'start',
  presentation = 'catalogue',
}: {
  site: SiteDetail;
  className?: string;
  contentAlign?: 'start' | 'center';
  presentation?: 'catalogue' | 'standalone';
}) {
  const liveResources = displayableResources(site.resources);
  const centered = contentAlign === 'center';
  const standalone = presentation === 'standalone';
  const header = <SiteCardHeader site={site} align={contentAlign} />;
  const headerLayoutClassName = centered
    ? 'flex-col items-center gap-2 px-3 pb-3 pt-3 text-center'
    : 'flex-col items-stretch gap-2 px-[17px] pb-[13px] pt-[15px]';

  return (
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
