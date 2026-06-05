'use client';

import { Dot } from '@/components/ui/dot';
import { PriceConfidence } from '@/components/ui/price-confidence';
import { priceFx } from '@/components/ui/price-fx';
import { ResourceRow as ResourceRowPrimitive } from '@/components/ui/row';
import { formatIsk } from '../format';
import type { SiteResource, SiteType } from '../types';
import { HACKING_DOT_TONE } from './wormhole-styles';
import { resourceLiveIsk, useSiteLive } from './site-live-context';

function formatM3(m3: number | null): string {
  if (m3 == null) return '—';
  return `${m3.toLocaleString()} m³`;
}

// The value cell. For a live-eligible resource it reads the shared site price
// context: while its live confirmation is in flight the seed dims behind a
// spinning badge, and when the value lands it flashes to the confirmed figure.
// Ineligible rows (no typeId / no unit count / unpriceable) render their static
// seed exactly as before.
function ResourceValue({ resource }: { resource: SiteResource }) {
  const live = useSiteLive();
  const eligible = resource.liveEligible && resource.typeId != null;
  const pending = eligible && live.isPending(resource.typeId as number);

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 opacity-40">
        <PriceConfidence level="unknown" loading />
        {formatIsk(resource.effectiveIsk)}
      </span>
    );
  }

  const fx = eligible ? priceFx(false, live.everPending) : '';
  return <span className={fx}>{formatIsk(resourceLiveIsk(resource, live))}</span>;
}

export function ResourceRow({
  resource,
  siteType,
}: {
  resource: SiteResource;
  siteType: SiteType;
}) {
  const value = <ResourceValue resource={resource} />;

  if (siteType === 'relic' || siteType === 'data') {
    return (
      <ResourceRowPrimitive
        colsClass="grid-cols-[1fr_auto]"
        name={
          <>
            <Dot tone={HACKING_DOT_TONE[siteType]} />
            {resource.resourceName}
          </>
        }
        value={value}
      />
    );
  }

  if (siteType === 'ore') {
    const units = resource.units ?? 0;
    const m3 = resource.volumeM3;
    return (
      <ResourceRowPrimitive
        colsClass="grid-cols-[1fr_auto_auto]"
        name={resource.resourceName}
        meta={`${units.toLocaleString()} rocks · ${formatM3(m3)}`}
        value={value}
      />
    );
  }

  // gas
  return (
    <ResourceRowPrimitive
      colsClass="grid-cols-[1fr_auto_auto]"
      name={resource.resourceName}
      meta={formatM3(resource.volumeM3)}
      value={value}
    />
  );
}
