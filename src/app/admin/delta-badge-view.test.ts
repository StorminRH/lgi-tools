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
});
