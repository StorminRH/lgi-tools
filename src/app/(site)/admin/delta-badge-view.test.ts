import { describe, expect, it } from 'vitest';
import { deriveDeltaBadge } from './delta-badge-view';

describe('deriveDeltaBadge', () => {
  it('reads new, flat, change, and inverted-colour badges', () => {
    expect(deriveDeltaBadge({ pct: null, direction: 'up' })).toEqual({ kind: 'new' });
    expect(deriveDeltaBadge({ pct: null, direction: 'flat' })).toEqual({ kind: 'none' });
    expect(deriveDeltaBadge({ pct: null, direction: 'down' })).toEqual({ kind: 'none' });
    expect(deriveDeltaBadge({ pct: 0, direction: 'flat' })).toEqual({ kind: 'flat' });
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
    expect(deriveDeltaBadge({ pct: -8, direction: 'down' }, true)).toEqual({
      kind: 'change',
      cls: 'text-isk',
      arrow: '▼',
      pct: 8,
    });
    expect(deriveDeltaBadge({ pct: 12, direction: 'up' }, true)).toEqual({
      kind: 'change',
      cls: 'text-tone-red',
      arrow: '▲',
      pct: 12,
    });
  });
});
