import type { Delta } from './period';

// The period-over-period delta badge, resolved to a render-ready shape: a metric
// with no previous-window denominator reads "new" (if it moved up) or "—", a
// within-band change reads "flat", and a real change carries its up/down colour,
// arrow, and absolute percent.
export type DeltaBadgeView =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'flat' }
  | { kind: 'change'; cls: string; arrow: string; pct: number };

export function deriveDeltaBadge(delta: Delta): DeltaBadgeView {
  if (delta.pct === null) {
    return delta.direction === 'up' ? { kind: 'new' } : { kind: 'none' };
  }
  if (delta.direction === 'flat') {
    return { kind: 'flat' };
  }
  const up = delta.direction === 'up';
  return {
    kind: 'change',
    cls: up ? 'text-isk' : 'text-tone-red',
    arrow: up ? '▲' : '▼',
    pct: Math.abs(delta.pct),
  };
}
