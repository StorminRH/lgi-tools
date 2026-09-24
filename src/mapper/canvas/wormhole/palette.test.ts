import { expect, test } from 'vitest';
import { wormholePalette, wormholeSeed } from './palette';

test('destination classes share a halo, stay distinct, and seed a stable unit-interval texture', () => {
  const halo = wormholePalette(1).halo;
  for (const id of [2, 3, 4, 5, 6, null, undefined]) {
    expect(wormholePalette(id).halo).toEqual(halo);
  }
  const palettes = [1, 2, 3, 4, 5, 6].map((id) => wormholePalette(id));
  expect(new Set(palettes.map((palette) => JSON.stringify(palette.core))).size).toBe(6);
  for (const id of [undefined, 0, 7, 12, NaN]) {
    expect(wormholePalette(id)).toEqual(wormholePalette(null));
  }
  expect(palettes[5]!.core[0]).toBeGreaterThan(palettes[5]!.core[2]);
  expect(wormholeSeed('31000001')).toBe(3818 / 4096);
  expect(wormholeSeed('31000002')).not.toBe(3818 / 4096);
});
