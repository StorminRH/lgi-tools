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

export function resourceValueEligible(resource: SiteResource): boolean {
  return resource.liveEligible && resource.typeId != null;
}
