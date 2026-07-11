'use client';

import { Dot } from '@/components/ui/dot';
import { LivePrice } from '@/components/ui/live-price';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { ResourceRow as ResourceRowPrimitive } from '@/components/ui/row';
import { formatIsk } from '../format';
import type { SiteResource, SiteType } from '../types';
import { deriveResourceRowView, resourceValueEligible } from './resource-row-view';
import { resourceLiveIsk, useSiteLive } from './site-live-context';

// The value cell. For a live-eligible resource it reads the shared site price
// context: while its live confirmation is in flight a spinning badge sits beside
// the seed figure, and when the value lands it flashes in to the confirmed
// figure. One persistent LivePrice spans the seed→live transition so the flash
// actually fires. Ineligible rows (no typeId / no unit count / unpriceable)
// render their static seed as plain text.
function ResourceValue({ resource }: { resource: SiteResource }) {
  const live = useSiteLive();

  if (!resourceValueEligible(resource)) {
    return <span>{formatIsk(resourceLiveIsk(resource, live))}</span>;
  }

  const pending = live.isPending(resource.typeId as number);
  const figure = formatIsk(pending ? resource.effectiveIsk : resourceLiveIsk(resource, live));
  return (
    <span className="inline-flex items-center gap-1.5">
      {pending && <PriceConfidence level="unknown" loading />}
      <LivePrice value={figure} />
    </span>
  );
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
      meta={view.meta ?? undefined}
      value={<ResourceValue resource={resource} />}
    />
  );
}
