import { describe, expect, it } from 'vitest';
import { characterPortraitUrl, corporationLogoUrl, type EveImageSize } from './eve-image';

const EXISTING_IMAGE_SIZES: EveImageSize[] = [32, 64, 128, 256, 512];

describe('EVE image URL builders', () => {
  it('keeps the default portrait and corporation URLs at 64 pixels', () => {
    expect(characterPortraitUrl(2112625428)).toBe(
      'https://images.evetech.net/characters/2112625428/portrait?size=64',
    );
    expect(corporationLogoUrl(98632851)).toBe(
      'https://images.evetech.net/corporations/98632851/logo?size=64',
    );
  });

  it.each(EXISTING_IMAGE_SIZES)(
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
