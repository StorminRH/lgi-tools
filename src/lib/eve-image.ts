const IMAGE_HOST = 'https://images.evetech.net';

export const EVE_IMAGE_SIZES = [32, 64, 128, 256, 512, 1024] as const;

export type EveImageSize = (typeof EVE_IMAGE_SIZES)[number];

export type EveImageFamily =
  | 'character-portrait'
  | 'corporation-logo'
  | 'alliance-logo'
  | 'type-icon'
  | 'type-render'
  | 'type-bp'
  | 'type-bpc';

const FAMILY_SIZES: Record<EveImageFamily, readonly EveImageSize[]> = {
  'character-portrait': EVE_IMAGE_SIZES,
  'corporation-logo': EVE_IMAGE_SIZES,
  'alliance-logo': EVE_IMAGE_SIZES,
  'type-icon': EVE_IMAGE_SIZES,
  'type-render': EVE_IMAGE_SIZES,
  'type-bp': EVE_IMAGE_SIZES,
  'type-bpc': EVE_IMAGE_SIZES,
};

export function snapEveImageSize(
  family: EveImageFamily,
  requestedWidth: number,
): EveImageSize {
  const sizes = FAMILY_SIZES[family];
  const snapped = sizes.find((size) => size >= requestedWidth);
  if (snapped !== undefined) return snapped;

  return EVE_IMAGE_SIZES.at(-1)!;
}

export function characterPortraitUrl(characterId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/characters/${characterId}/portrait?size=${size}`;
}

export function corporationLogoUrl(corporationId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/corporations/${corporationId}/logo?size=${size}`;
}
