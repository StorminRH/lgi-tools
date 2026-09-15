import { expect, test } from 'vitest';
import { wormholePalette, wormholeSeed } from './palette';

test('destination palette is independent of per-jump mass allowance', () => {
  const regular = wormholePalette(5);
  const frigate = wormholePalette(5, 'small');
  const capital = wormholePalette(5, 'capital');
  expect(regular.core).toEqual(frigate.core);
  expect(frigate.core).toEqual(capital.core);
  expect(frigate.halo).not.toEqual(capital.halo);
  expect(wormholePalette(1).halo).toEqual(wormholePalette(6).halo);
});

test('six art-directed palettes are distinct; unknown and special classes are honestly neutral', () => {
  const palettes = [1, 2, 3, 4, 5, 6].map((id) => wormholePalette(id));
  expect(new Set(palettes.map((p) => JSON.stringify(p.core))).size).toBe(6);
  for (const id of [undefined, null, 0, 7, 12, 13, 14, 99, NaN]) {
    expect(wormholePalette(id)).toEqual(wormholePalette(null));
  }
  expect(palettes[5]!.core[0]).toBeGreaterThan(palettes[5]!.core[2]);
});

test('texture seed is deterministic and bounded', () => {
  expect(wormholeSeed('31000001')).toBe(wormholeSeed('31000001'));
  expect(wormholeSeed('31000001')).not.toBe(wormholeSeed('31000002'));
  expect(wormholeSeed('')).toBeGreaterThanOrEqual(0);
  expect(wormholeSeed('stub:ABC-123')).toBeLessThan(1);
});
