import { describe, expect, it } from 'vitest';
import { deriveNpcNameColWidth, type NpcRowMetrics } from './npc-name-col';

const row = (name: number, trailing: number, gridContent: number): NpcRowMetrics => ({
  name,
  trailing,
  gridContent,
});

describe('deriveNpcNameColWidth', () => {
  it('returns null when no name has width or no grid was measured', () => {
    expect(deriveNpcNameColWidth([])).toBeNull();
    expect(deriveNpcNameColWidth([row(0, 20, 400)])).toBeNull();
    expect(deriveNpcNameColWidth([row(120, 20, Infinity)])).toBeNull();
  });

  it('uses the widest name plus the buffer when the card has room', () => {
    expect(deriveNpcNameColWidth([row(120, 30, 400), row(90, 30, 400)])).toBe(130);
  });

  it('clamps to the space left after the busiest EWAR+DPS row', () => {
    expect(deriveNpcNameColWidth([row(200, 120, 300)])).toBe(118);
  });

  it('never drops below the minimum name width', () => {
    expect(deriveNpcNameColWidth([row(200, 40, 100)])).toBe(40);
  });

  it('takes the narrowest grid across rows', () => {
    expect(deriveNpcNameColWidth([row(120, 20, 500), row(80, 20, 300)])).toBe(130);
  });
});
