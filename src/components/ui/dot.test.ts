import { describe, expect, it } from 'vitest';
import { Dot } from './dot';

describe('Dot', () => {
  it('preserves the legacy medium orange and blue looks', () => {
    expect(Dot({ tone: 'orange' }).props.className).toContain('bg-tone-orange-soft');
    expect(Dot({ tone: 'orange' }).props.className).toContain('shadow-dot-orange');
    expect(Dot({ tone: 'blue' }).props.className).toContain('shadow-dot-blue');
  });

  it('maps shared status tones and sizes', () => {
    expect(Dot({ tone: 'green', size: 'lg' }).props.className).toContain('size-2');
    expect(Dot({ tone: 'red' }).props.className).toContain('bg-tone-red');
    expect(Dot({ tone: 'neutral' }).props.className).toContain('bg-muted');
  });

  it('keeps the five-pixel orange status dot unshadowed', () => {
    const className = Dot({ tone: 'orange', size: 'sm' }).props.className;
    expect(className).toContain('bg-tone-orange');
    expect(className).toContain('shadow-none');
  });
});
