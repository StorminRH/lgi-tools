import type { Delta } from '@/composition/admin-period';

export type DeltaBadgeView =
  | { kind: 'new' }
  | { kind: 'none' }
  | { kind: 'flat' }
  | { kind: 'change'; cls: string; arrow: string; pct: number };

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
