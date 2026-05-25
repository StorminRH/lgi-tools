import { describe, expect, it } from 'vitest';
import { toneTextClass } from './tones';

describe('toneTextClass', () => {
  it('maps green to the ISK accent CSS var', () => {
    expect(toneTextClass('green')).toBe('text-[var(--color-isk)]');
  });

  it('maps orange to the DPS-mid CSS var', () => {
    expect(toneTextClass('orange')).toBe('text-[var(--color-dps-mid)]');
  });

  it('maps red to the DPS-high CSS var', () => {
    expect(toneTextClass('red')).toBe('text-[var(--color-dps-high)]');
  });
});
