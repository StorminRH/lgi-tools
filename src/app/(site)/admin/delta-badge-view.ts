import type { Delta } from '@/composition/admin-period';

/**
 * `text` is what the badge shows; `spoken` is what a screen reader says
 * instead, since the arrows read as glyph names and the dash as nothing.
 * `tone` is green for good news, red for bad, neutral for no change.
 */
export interface DeltaBadgeView {
  kind: 'new' | 'none' | 'flat' | 'change';
  tone: 'green' | 'red' | 'neutral';
  text: string;
  spoken: string;
}

export function deriveDeltaBadge(delta: Delta, invert = false): DeltaBadgeView {
  if (delta.pct === null) {
    // No prior figure to compare: either growth from zero, or zero both times.
    return delta.direction === 'up'
      ? { kind: 'new', tone: 'green', text: 'new', spoken: 'new' }
      : { kind: 'none', tone: 'neutral', text: '—', spoken: 'no change' };
  }
  if (delta.direction === 'flat') {
    return { kind: 'flat', tone: 'neutral', text: '±0%', spoken: 'no change' };
  }
  const up = delta.direction === 'up';
  const pct = Math.abs(delta.pct);
  return {
    kind: 'change',
    tone: up !== invert ? 'green' : 'red',
    text: `${up ? '▲' : '▼'} ${pct}%`,
    spoken: `${up ? 'up' : 'down'} ${pct}%`,
  };
}
