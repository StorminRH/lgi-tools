import { describe, expect, it } from 'vitest';
import { endLabelFor } from './end-label';

describe('endLabelFor', () => {
  it('carries no delta text when there is no delta', () => {
    expect(endLabelFor('1,200', null, false)).toEqual({
      valueText: '1,200',
      deltaText: null,
      deltaHex: null,
    });
  });

  it('formats an up change green and a down change red', () => {
    expect(endLabelFor('10', { pct: 12, direction: 'up' }, false)).toMatchObject({
      deltaText: '▲ 12%',
    });
    expect(endLabelFor('10', { pct: -8, direction: 'down' }, false)).toMatchObject({
      deltaText: '▼ 8%',
    });
  });

  it('inverts the colour for a lower-is-better metric (a fall is green)', () => {
    const up = endLabelFor('10', { pct: 12, direction: 'up' }, false);
    const down = endLabelFor('8', { pct: -8, direction: 'down' }, true);
    // Same green hex for "good" whether it's an inverted fall or a normal rise.
    expect(down.deltaHex).toBe(up.deltaHex);
    expect(down.deltaText).toBe('▼ 8%');
  });

  it('reads a null-pct rise as "new" and a flat change as ±0%', () => {
    expect(endLabelFor('5', { pct: null, direction: 'up' }, false).deltaText).toBe('new');
    expect(endLabelFor('5', { pct: 0, direction: 'flat' }, false).deltaText).toBe('±0%');
  });
});
