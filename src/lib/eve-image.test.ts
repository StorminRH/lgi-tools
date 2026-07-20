import { describe, expect, it } from 'vitest';
import {
  characterPortraitUrl,
  corporationLogoUrl,
  EVE_IMAGE_SIZES,
  type EveImageFamily,
  type EveImageSize,
  snapEveImageSize,
} from './eve-image';

const IMAGE_SIZES: EveImageSize[] = [32, 64, 128, 256, 512, 1024];
const FAMILIES: EveImageFamily[] = [
  'character-portrait',
  'corporation-logo',
  'alliance-logo',
  'type-icon',
  'type-render',
  'type-bp',
  'type-bpc',
];

describe('EVE image URL builders', () => {
  it('keeps the default portrait and corporation URLs at 64 pixels', () => {
    expect(characterPortraitUrl(2112625428)).toBe(
      'https://images.evetech.net/characters/2112625428/portrait?size=64',
    );
    expect(corporationLogoUrl(98632851)).toBe(
      'https://images.evetech.net/corporations/98632851/logo?size=64',
    );
  });

  it.each(IMAGE_SIZES)(
    'keeps portrait and corporation URLs byte-identical at %i pixels',
    (size) => {
      expect(characterPortraitUrl(2112625428, size)).toBe(
        `https://images.evetech.net/characters/2112625428/portrait?size=${size}`,
      );
      expect(corporationLogoUrl(98632851, size)).toBe(
        `https://images.evetech.net/corporations/98632851/logo?size=${size}`,
      );
    },
  );
});

describe('EVE image size policy', () => {
  it('snaps up the size ladder and caps at its derived maximum', () => {
    expect(snapEveImageSize('character-portrait', 1)).toBe(32);
    expect(snapEveImageSize('character-portrait', 32)).toBe(32);
    expect(snapEveImageSize('character-portrait', 33)).toBe(64);
    expect(snapEveImageSize('character-portrait', 1024)).toBe(1024);
    expect(snapEveImageSize('character-portrait', 2048)).toBe(1024);
  });

  it.each(FAMILIES)('uses the canonical ladder for %s', (family) => {
    expect(EVE_IMAGE_SIZES.map((size) => snapEveImageSize(family, size))).toEqual(
      EVE_IMAGE_SIZES,
    );
  });
});
