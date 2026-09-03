import type { SiteResource } from './types';

export function displayableResources(resources: SiteResource[]): SiteResource[] {
  return resources.filter((r) => r.resourceKind !== 'ore' || (r.units ?? 0) > 0);
}
