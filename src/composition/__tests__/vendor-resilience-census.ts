import type {
  NoProgrammaticSurface,
  VendorResilienceEntry,
} from './vendor-resilience-registry';

export function isNoProgrammaticSurface(
  entry: VendorResilienceEntry,
): entry is NoProgrammaticSurface {
  return 'noProgrammaticSurface' in entry;
}
