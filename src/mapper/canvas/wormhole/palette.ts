import { securityBand } from '@/data/eve-data/security';
import type { WormholeEffect } from '@/data/eve-data/wormhole-contract';

/** Art-directed approximations of destination nebulae, not official CCP RGB values.
 * References: https://wiki.eveuniversity.org/Visual_wormhole_identification
 * and https://www.eveonline.com/news/view/september-release-wormholes-and-stars-get-an-update
 */
export type RGB = readonly [number, number, number];

export interface WormholePalette {
  readonly core: RGB;
  readonly accent: RGB;
  readonly dark: RGB;
  readonly highlight: RGB;
  readonly halo: RGB;
}

const NEUTRAL = {
  core: [0.54, 0.59, 0.63], accent: [0.68, 0.72, 0.75],
  dark: [0.012, 0.018, 0.027], highlight: [0.90, 0.94, 0.97],
} as const;

const CLASSES: Readonly<Record<number, Omit<WormholePalette, 'halo'>>> = {
  1: { core: [0.53, 0.60, 0.65], accent: [0.40, 0.69, 0.74], dark: [0.012, 0.020, 0.032], highlight: [0.90, 0.96, 1] },
  2: { core: [0.60, 0.57, 0.52], accent: [0.72, 0.74, 0.73], dark: [0.019, 0.015, 0.013], highlight: [0.94, 0.92, 0.86] },
  3: { core: [0.56, 0.58, 0.63], accent: [0.82, 0.29, 0.34], dark: [0.027, 0.013, 0.026], highlight: [0.96, 0.89, 0.90] },
  4: { core: [0.43, 0.25, 0.42], accent: [0.74, 0.19, 0.27], dark: [0.032, 0.009, 0.025], highlight: [1, 0.94, 0.96] },
  5: { core: [0.61, 0.28, 0.20], accent: [0.88, 0.30, 0.29], dark: [0.038, 0.015, 0.010], highlight: [0.90, 0.76, 0.67] },
  6: { core: [0.91, 0.26, 0.08], accent: [1, 0.49, 0.15], dark: [0.036, 0.008, 0.009], highlight: [1, 0.86, 0.67] },
};

const HALO: RGB = [0.53, 0.61, 0.68];

function wormholePalette(whClassId: number | null): WormholePalette {
  const core = whClassId === null ? NEUTRAL : CLASSES[whClassId] ?? NEUTRAL;
  return { ...core, halo: HALO };
}

export type DiscBody =
  | { readonly kind: 'wormhole'; readonly classId: number | null; readonly effect: WormholeEffect | null }
  | { readonly kind: 'planet'; readonly security: number };

export const EFFECT_MODE: Readonly<Record<WormholeEffect, number>> = {
  pulsar: 1,
  'black-hole': 2,
  magnetar: 3,
  'red-giant': 4,
  'cataclysmic-variable': 5,
  'wolf-rayet': 6,
};

const SPHERE_MODE = 0;

export const PLANET_MODE = 7;

export interface BodyAppearance {
  readonly palette: WormholePalette;
  readonly mode: number;
  readonly tint: RGB;
}

const HEX_COLOR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

function hexRgb(value: string): RGB | null {
  const match = HEX_COLOR.exec(value.trim());
  if (match === null) return null;
  const channel = (index: number) => Number.parseInt(match[index] ?? '', 16) / 255;
  return [channel(1), channel(2), channel(3)];
}

function tintToken(body: DiscBody): string | null {
  if (body.kind === 'planet') return `--color-sec-${securityBand(body.security)}`;
  return body.effect === null ? null : `--color-effect-${body.effect}`;
}

export function discBodyAppearance(
  body: DiscBody,
  readToken: (token: string) => string,
): BodyAppearance {
  const token = tintToken(body);
  const tint = (token === null ? null : hexRgb(readToken(token))) ?? HALO;
  if (body.kind === 'planet') return { palette: wormholePalette(null), mode: PLANET_MODE, tint };
  const mode = body.effect === null ? SPHERE_MODE : EFFECT_MODE[body.effect];
  return { palette: wormholePalette(body.classId), mode, tint };
}

export function wormholeSeed(key: string): number {
  let hash = 5381;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return (hash % 4096) / 4096;
}
