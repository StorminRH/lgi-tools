import { describe, expect, it } from 'vitest';
import { deriveDeltaBadge } from './delta-badge-view';

describe('deriveDeltaBadge', () => {
  it('reads a null-pct metric as "new" when up, "none" otherwise', () => {
    expect(deriveDeltaBadge({ pct: null, direction: 'up' })).toEqual({ kind: 'new' });
    expect(deriveDeltaBadge({ pct: null, direction: 'flat' })).toEqual({ kind: 'none' });
    expect(deriveDeltaBadge({ pct: null, direction: 'down' })).toEqual({ kind: 'none' });
  });

  it('reads a within-band change as flat', () => {
    expect(deriveDeltaBadge({ pct: 0, direction: 'flat' })).toEqual({ kind: 'flat' });
  });

  it('carries the colour, arrow, and absolute percent for a real change', () => {
    expect(deriveDeltaBadge({ pct: 12, direction: 'up' })).toEqual({
      kind: 'change',
      cls: 'text-isk',
      arrow: '▲',
      pct: 12,
    });
    expect(deriveDeltaBadge({ pct: -8, direction: 'down' })).toEqual({
      kind: 'change',
      cls: 'text-tone-red',
      arrow: '▼',
      pct: 8,
    });
  });

  it('inverts the colour for lower-is-better metrics but keeps the numeric arrow', () => {
    // A falling position is an improvement: green, but still a ▼ (numeric down).
    expect(deriveDeltaBadge({ pct: -8, direction: 'down' }, true)).toEqual({
      kind: 'change',
      cls: 'text-isk',
      arrow: '▼',
      pct: 8,
    });
    // A rising position is worse: red, still a ▲.
    expect(deriveDeltaBadge({ pct: 12, direction: 'up' }, true)).toEqual({
      kind: 'change',
      cls: 'text-tone-red',
      arrow: '▲',
      pct: 12,
    });
  });
});
