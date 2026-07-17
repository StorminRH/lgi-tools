// EVE image-server URL builders (images.evetech.net). Pure URL construction —
// no lookup, no network. The CSP `img-src` already allows this host. Lives in
// lib so any feature can build a portrait/logo URL without a cross-feature
// import (the merged active-jobs board needs both for per-job runner
// attribution: the installer's portrait + the corporation's logo badge).
const IMAGE_HOST = 'https://images.evetech.net';

/**
 * Supported square EVE image rendition in pixels; requests are snapped upward to one of these
 * server-backed sizes.
 */
export type EveImageSize = 32 | 64 | 128 | 256 | 512;

/** Builds the canonical EVE character-portrait URL for a supported square pixel size. */
export function characterPortraitUrl(characterId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/characters/${characterId}/portrait?size=${size}`;
}

/** Builds the canonical EVE corporation-logo URL for a supported square pixel size. */
export function corporationLogoUrl(corporationId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/corporations/${corporationId}/logo?size=${size}`;
}
