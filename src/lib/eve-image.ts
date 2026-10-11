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

const FAMILY_PATH: Record<EveImageFamily, (id: number) => string> = {
  'character-portrait': (id) => `characters/${id}/portrait`,
  'corporation-logo': (id) => `corporations/${id}/logo`,
  'alliance-logo': (id) => `alliances/${id}/logo`,
  'type-icon': (id) => `types/${id}/icon`,
  'type-render': (id) => `types/${id}/render`,
  'type-bp': (id) => `types/${id}/bp`,
  'type-bpc': (id) => `types/${id}/bpc`,
};

/**
 * The image-server URL for one entity's image. EveImage's loader rewrites
 * the size to fit the box it renders, so the size here only matters to a
 * URL that is stored or used outside EveImage.
 */
export function eveImageSrc(family: EveImageFamily, id: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/${FAMILY_PATH[family](id)}?size=${size}`;
}

export function characterPortraitUrl(characterId: number, size: EveImageSize = 64): string {
  return eveImageSrc('character-portrait', characterId, size);
}
