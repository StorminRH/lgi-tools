import { describe, expect, it } from 'vitest';
import {
  characterPortraitUrl,
  EVE_IMAGE_SIZES,
  eveImageSrc,
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
    expect(eveImageSrc('corporation-logo', 98632851)).toBe(
      'https://images.evetech.net/corporations/98632851/logo?size=64',
    );
  });

  it.each(IMAGE_SIZES)(
    'keeps portrait and corporation URLs byte-identical at %i pixels',
    (size) => {
      expect(characterPortraitUrl(2112625428, size)).toBe(
        `https://images.evetech.net/characters/2112625428/portrait?size=${size}`,
      );
      expect(eveImageSrc('corporation-logo', 98632851, size)).toBe(
        `https://images.evetech.net/corporations/98632851/logo?size=${size}`,
      );
    },
  );

  it.each([
    ['character-portrait', 'characters/90000001/portrait'],
    ['corporation-logo', 'corporations/90000001/logo'],
    ['alliance-logo', 'alliances/90000001/logo'],
    ['type-icon', 'types/90000001/icon'],
    ['type-render', 'types/90000001/render'],
    ['type-bp', 'types/90000001/bp'],
    ['type-bpc', 'types/90000001/bpc'],
  ] satisfies [EveImageFamily, string][])('builds the %s path on the CCP image server', (family, path) => {
    expect(eveImageSrc(family, 90000001)).toBe(`https://images.evetech.net/${path}?size=64`);
    expect(eveImageSrc(family, 90000001, 512)).toBe(`https://images.evetech.net/${path}?size=512`);
  });
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
