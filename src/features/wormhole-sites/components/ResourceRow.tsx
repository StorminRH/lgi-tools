'use client';

import { Dot } from '@/components/ui/dot';
import { LivePrice } from '@/components/ui/live-price';
import { ResourceRow as ResourceRowPrimitive } from '@/components/ui/row';
import { formatIskShort } from '@/lib/format/isk';
import { isLivePricedResource } from '../live-isk';
import type { SiteResource, SiteType } from '../types';
import { deriveResourceRowView } from './resource-row-view';
import { resourceLiveIsk, useSiteLive } from './site-live-context';

function ResourceValue({ resource }: { resource: SiteResource }) {
  const live = useSiteLive();

  if (!isLivePricedResource(resource)) {
    return <span className="font-data">{formatIskShort(resource.effectiveIsk)}</span>;
  }

  const pending = live.isPending(resource.typeId);
  const figure = formatIskShort(pending ? resource.effectiveIsk : resourceLiveIsk(resource, live));
  return <LivePrice value={figure} pending={pending} />;
}

export function SiteResourceRow({
  resource,
  siteType,
}: {
  resource: SiteResource;
  siteType: SiteType;
}) {
  const view = deriveResourceRowView(resource, siteType);
  const name =
    view.dotTone != null ? (
      <>
        <Dot tone={view.dotTone} />
        {resource.resourceName}
      </>
    ) : (
      resource.resourceName
    );

  return (
    <ResourceRowPrimitive
      colsClass={view.colsClass}
      name={name}
      meta={view.meta ? <span className="font-data">{view.meta}</span> : undefined}
      value={<ResourceValue resource={resource} />}
    />
  );
}
