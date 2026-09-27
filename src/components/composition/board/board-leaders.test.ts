import { describe, expect, it } from 'vitest';
import { leaderLines } from './board-leaders';

const portrait = { left: 0, top: 0, right: 160, bottom: 160 };

describe('leaderLines', () => {
  it('draws nothing without panels', () => {
    expect(leaderLines(portrait, 280, [], 16)).toEqual([]);
  });

  it('runs a trunk beside the portrait into each first-column panel header', () => {
    const [queue] = leaderLines(portrait, 280, [{ key: 'queue', box: { left: 360, top: 40, right: 700, bottom: 300 } }], 16);
    expect(queue?.end).toEqual({ x: 360, y: 58 });
    expect(queue?.d.startsWith('M 166 80 L')).toBe(true);
    expect(queue?.d).toContain('320');
    expect(queue?.d.endsWith('L 360 58')).toBe(true);
  });

  it('reaches a further column along the gap above the panels and the gutter before it', () => {
    const lines = leaderLines(
      portrait,
      280,
      [
        { key: 'queue', box: { left: 360, top: 40, right: 700, bottom: 300 } },
        { key: 'wallet', box: { left: 716, top: 40, right: 1100, bottom: 900 } },
      ],
      16,
    );
    const wallet = lines[1]!;
    expect(wallet.end).toEqual({ x: 716, y: 58 });
    expect(wallet.d).toContain(' 30');
    expect(wallet.d).toContain('708');
  });
});
