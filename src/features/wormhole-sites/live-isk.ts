import type { SiteResource } from './types';

export function liveIskFor(units: number | null, unitPrice: number | null): number | null {
  if (units == null || units <= 0) return null;
  if (!unitPrice) return null;
  return Math.round(units * unitPrice);
}

/** A resource the client can live-price: flagged eligible, with a type id and a positive unit count. */
export type LivePricedResource = SiteResource & {
  liveEligible: true;
  typeId: number;
  units: number;
};

export function isLivePricedResource(resource: SiteResource): resource is LivePricedResource {
  return (
    resource.liveEligible &&
    resource.typeId != null &&
    resource.units != null &&
    resource.units > 0
  );
}
