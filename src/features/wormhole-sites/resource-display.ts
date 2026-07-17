import type { SiteResource } from './types';

/**
 * The resources a site actually shows: depleted ore deposits (no units left)
 * are hidden — they carry only a stale stored value, not a harvestable rock.
 * One source of truth so the card header total, the section footer total, and
 * the visible rows all sum the same set and can never disagree.
 */
export function displayableResources(resources: SiteResource[]): SiteResource[] {
  return resources.filter((r) => r.resourceKind !== 'ore' || (r.units ?? 0) > 0);
}
