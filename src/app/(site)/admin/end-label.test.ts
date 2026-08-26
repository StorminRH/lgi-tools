import { describe, expect, it } from 'vitest';
import { endLabelFor } from './end-label';

describe('endLabelFor', () => {
  it('formats missing, up, down, inverted, new, and flat deltas', () => {
    expect(endLabelFor('1,200', null, false)).toEqual({
      valueText: '1,200',
      deltaText: null,
      deltaHex: null,
    });
    const up = endLabelFor('10', { pct: 12, direction: 'up' }, false);
    const down = endLabelFor('10', { pct: -8, direction: 'down' }, false);
    const invertedFall = endLabelFor('8', { pct: -8, direction: 'down' }, true);
    expect(up).toMatchObject({ deltaText: '▲ 12%' });
    expect(down).toMatchObject({ deltaText: '▼ 8%' });
    expect(invertedFall.deltaHex).toBe(up.deltaHex);
    expect(invertedFall.deltaText).toBe('▼ 8%');
    expect(endLabelFor('5', { pct: null, direction: 'up' }, false).deltaText).toBe('new');
    expect(endLabelFor('5', { pct: 0, direction: 'flat' }, false).deltaText).toBe('±0%');
  });
});
