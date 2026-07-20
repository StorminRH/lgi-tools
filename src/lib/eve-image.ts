// EVE image-server capabilities and URL builders (images.evetech.net). This is
// the single owner of the server-backed size vocabulary, per-family support,
// and snapping policy. It has no lookup or network behavior, and it stays below
// the next/image adapter so any feature can consume these facts without a
// component-layer dependency. The CSP `img-src` already allows this host.
const IMAGE_HOST = 'https://images.evetech.net';

/**
 * Canonical ordered ladder of server-backed EVE image renditions in pixels.
 * Every size type, cap, and snap decision derives from this array.
 */
export const EVE_IMAGE_SIZES = [32, 64, 128, 256, 512, 1024] as const;

/**
 * A supported square EVE image rendition in pixels, drawn from EVE_IMAGE_SIZES.
 * Requests are snapped upward to one of these.
 */
export type EveImageSize = (typeof EVE_IMAGE_SIZES)[number];

/**
 * Closed set of EVE image-server endpoint families that share the canonical
 * size ladder.
 */
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

/**
 * Rounds a requested pixel width up to the nearest rendition the family
 * supports, capped at the maximum derived from EVE_IMAGE_SIZES.
 */
export function snapEveImageSize(
  family: EveImageFamily,
  requestedWidth: number,
): EveImageSize {
  const sizes = FAMILY_SIZES[family];
  const snapped = sizes.find((size) => size >= requestedWidth);
  if (snapped !== undefined) return snapped;
  // EVE_IMAGE_SIZES is a non-empty tuple, so its final element exists by construction.
  return EVE_IMAGE_SIZES.at(-1)!;
}

/** Builds the canonical EVE character-portrait URL for a supported square pixel size. */
export function characterPortraitUrl(characterId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/characters/${characterId}/portrait?size=${size}`;
}

/** Builds the canonical EVE corporation-logo URL for a supported square pixel size. */
export function corporationLogoUrl(corporationId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/corporations/${corporationId}/logo?size=${size}`;
}
