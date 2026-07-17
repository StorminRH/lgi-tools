import type { DotTone } from '@/components/ui/tones';
import type { SiteResource, SiteType } from '../types';
import { HACKING_DOT_TONE } from './wormhole-styles';

export function formatM3(m3: number | null): string {
  if (m3 == null) return '—';
  return `${m3.toLocaleString()} m³`;
}

export type ResourceRowView = {
  colsClass: string;
  meta: string | null;
  dotTone: DotTone | null;
};

/**
 * The layout for one resource row, keyed by site type: hackable containers get a
 * two-column row with a coloured bullet, ore/gas get a three-column row with a
 * quantity·volume meta line (gas without a unit count shows volume alone).
 */
export function deriveResourceRowView(resource: SiteResource, siteType: SiteType): ResourceRowView {
  if (siteType === 'relic' || siteType === 'data') {
    return { colsClass: 'grid-cols-[1fr_auto]', meta: null, dotTone: HACKING_DOT_TONE[siteType] };
  }
  if (siteType === 'ore') {
    const units = resource.units ?? 0;
    return {
      colsClass: 'grid-cols-[1fr_auto_auto]',
      meta: `${units.toLocaleString()} rocks · ${formatM3(resource.volumeM3)}`,
      dotTone: null,
    };
  }
  const gasMeta =
    resource.units != null
      ? `${resource.units.toLocaleString()} units · ${formatM3(resource.volumeM3)}`
      : formatM3(resource.volumeM3);
  return { colsClass: 'grid-cols-[1fr_auto_auto]', meta: gasMeta, dotTone: null };
}

/**
 * A resource shows a live-confirmed price only when the site marks it live-eligible
 * and it carries a market type id; everything else renders its static seed.
 */
export function resourceValueEligible(resource: SiteResource): boolean {
  return resource.liveEligible && resource.typeId != null;
}
