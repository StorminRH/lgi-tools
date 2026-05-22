import { Dot } from '@/components/ui/dot';
import { ResourceRow as ResourceRowPrimitive } from '@/components/ui/row';
import type { SiteResource, SiteType } from '../types';

const ISK_ZEROS = 1_000_000;

function formatIsk(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  return `${(isk / ISK_ZEROS).toFixed(1)}M`;
}

function formatM3(m3: number | null): string {
  if (m3 == null) return '—';
  return `${m3.toLocaleString()} m³`;
}

export function ResourceRow({
  resource,
  siteType,
}: {
  resource: SiteResource;
  siteType: SiteType;
}) {
  if (siteType === 'relic' || siteType === 'data') {
    return (
      <ResourceRowPrimitive
        cols="1fr auto"
        name={
          <>
            <Dot tone={siteType} />
            {resource.resourceName}
          </>
        }
        value={formatIsk(resource.totalIsk)}
      />
    );
  }

  if (siteType === 'ore') {
    const units = resource.units ?? 0;
    const m3 = resource.volumeM3;
    return (
      <ResourceRowPrimitive
        cols="1fr auto auto"
        name={resource.resourceName}
        meta={`${units.toLocaleString()} rocks · ${formatM3(m3)}`}
        value={formatIsk(resource.totalIsk)}
      />
    );
  }

  // gas
  return (
    <ResourceRowPrimitive
      cols="1fr auto auto"
      name={resource.resourceName}
      meta={formatM3(resource.volumeM3)}
      value={formatIsk(resource.totalIsk)}
    />
  );
}
