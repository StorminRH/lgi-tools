// EVE image-server URL builders (images.evetech.net). Pure URL construction —
// no lookup, no network. The CSP `img-src` already allows this host. Lives in
// lib so any feature can build a portrait/logo URL without a cross-feature
// import (the merged active-jobs board needs both for per-job runner
// attribution: the installer's portrait + the corporation's logo badge).
const IMAGE_HOST = 'https://images.evetech.net';

export type EveImageSize = 32 | 64 | 128 | 256 | 512;

export function characterPortraitUrl(characterId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/characters/${characterId}/portrait?size=${size}`;
}

export function corporationLogoUrl(corporationId: number, size: EveImageSize = 64): string {
  return `${IMAGE_HOST}/corporations/${corporationId}/logo?size=${size}`;
}
