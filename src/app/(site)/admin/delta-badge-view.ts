import type { Delta } from '@/composition/admin-period';

/**
 * The period-over-period delta badge, resolved to a render-ready shape: a metric
 * with no previous-window denominator reads "new" (if it moved up) or "—", a
 * within-band change reads "flat", and a real change carries its up/down colour,
 * arrow, and absolute percent.
 */
export type DeltaBadgeView =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'flat' }
  | { kind: 'change'; cls: string; arrow: string; pct: number };

/**
 * `invert` is for metrics where lower is better (search-result position): the
 * ▲/▼ arrow always follows the numeric direction, but the good/bad colour flips
 * — a falling position is an improvement (green), a rising one is worse (red).
 */
export function deriveDeltaBadge(delta: Delta, invert = false): DeltaBadgeView {
  if (delta.pct === null) {
    return delta.direction === 'up' ? { kind: 'new' } : { kind: 'none' };
  }
  if (delta.direction === 'flat') {
    return { kind: 'flat' };
  }
  const up = delta.direction === 'up';
  const good = invert ? !up : up;
  return {
    kind: 'change',
    cls: good ? 'text-isk' : 'text-tone-red',
    arrow: up ? '▲' : '▼',
    pct: Math.abs(delta.pct),
  };
}
