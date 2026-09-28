import type { GlanceBucket } from '../signatures/signature-model';

export type TrackSeat =
  | { readonly kind: 'glance'; readonly bucket: GlanceBucket }
  | { readonly kind: 'pilot'; readonly count: number };

export function trackSeats(
  marks: readonly GlanceBucket[],
  pilotCount: number,
): readonly TrackSeat[] {
  const glance: readonly TrackSeat[] = marks.map((bucket) => ({ kind: 'glance', bucket }));
  return pilotCount > 0 ? [...glance, { kind: 'pilot', count: pilotCount }] : glance;
}
