import { expect, test } from 'vitest';
import { WORMHOLE_EFFECTS, type WormholeEffect } from '@/data/eve-data/wormhole-contract';
import { discBodyAppearance, EFFECT_MODE, PLANET_MODE, wormholeSeed } from './palette';

const TOKENS: Readonly<Record<string, string>> = {
  '--color-effect-pulsar': ' #8fd0ff',
  '--color-sec-04': '#dc6c06 ',
  '--color-sec-09': 'rgb(57 154 235)',
};
const readToken = (token: string) => TOKENS[token] ?? '';
const wormhole = (classId: number | null, effect: WormholeEffect | null = null) =>
  discBodyAppearance({ kind: 'wormhole', classId, effect }, readToken);
const planet = (security: number) => discBodyAppearance({ kind: 'planet', security }, readToken);
const HALO = [0.53, 0.61, 0.68];

test('destination classes share a halo, stay distinct, and seed a stable unit-interval texture', () => {
  const halo = wormhole(1).palette.halo;
  for (const id of [2, 3, 4, 5, 6, null]) {
    expect(wormhole(id).palette.halo).toEqual(halo);
  }
  const palettes = [1, 2, 3, 4, 5, 6].map((id) => wormhole(id).palette);
  expect(new Set(palettes.map((palette) => JSON.stringify(palette.core))).size).toBe(6);
  for (const id of [0, 7, 12, NaN]) {
    expect(wormhole(id).palette).toEqual(wormhole(null).palette);
  }
  expect(palettes[5]!.core[0]).toBeGreaterThan(palettes[5]!.core[2]);
  expect(wormholeSeed('31000001')).toBe(3818 / 4096);
  expect(wormholeSeed('31000002')).not.toBe(3818 / 4096);
});

test('bodies pick a shader mode and resolve their tint token, falling back to the halo', () => {
  expect(wormhole(5)).toMatchObject({ mode: 0, tint: HALO });
  expect(wormhole(5, 'pulsar')).toMatchObject({
    mode: 1,
    tint: [0x8f / 255, 0xd0 / 255, 1],
    palette: wormhole(5).palette,
  });
  expect(wormhole(5, 'wolf-rayet')).toMatchObject({ mode: 6, tint: HALO });
  expect(planet(0.43)).toMatchObject({
    mode: PLANET_MODE,
    tint: [0xdc / 255, 0x6c / 255, 0x06 / 255],
    palette: wormhole(null).palette,
  });
  expect(planet(0.9).tint).toEqual(HALO);
  const modes = WORMHOLE_EFFECTS.map((effect) => EFFECT_MODE[effect]);
  expect(modes).toEqual([1, 2, 3, 4, 5, 6]);
  expect(modes).not.toContain(PLANET_MODE);
});
