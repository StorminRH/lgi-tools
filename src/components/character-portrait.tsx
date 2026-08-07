'use client';

// The one character portrait used everywhere — a round, bordered avatar
// modeled on the home-roster tiles, so every surface (the live cards, the
// roster, /characters, the nav, the corp board, admin) renders the same
// portrait. The MIGRATE.A-era live online dot was retired with the sitewide
// online-status machinery: Convex now activates only on Atlas surfaces, and
// in-game presence lives inside the location tracker's own probe.
// House style: className-only, no JSX style.
import { characterPortraitUrl } from '@/lib/eve-image';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';

/**
 * The display sizes in use across the app, mapped to literal size utilities (a
 * dynamic `size-[Npx]` can't be statically extracted by Tailwind, and the img
 * needs an explicit size class because preflight forces height:auto otherwise).
 */
export type PortraitSize = 28 | 32 | 36 | 38 | 64;

const SIZE_CLASS: Record<PortraitSize, string> = {
  28: 'size-7',
  32: 'size-8',
  36: 'size-9',
  38: 'size-[38px]',
  64: 'size-16',
};

/**
 * Renders one EVE character portrait at a supported semantic size, with the shared image fallback
 * and optional preload behavior.
 */
export function CharacterPortrait({
  characterId,
  name,
  size,
  src,
  className,
  loading,
  preload = false,
}: {
  // The character's id, used (absent a `src`) to build the image URL.
  // Optional for the rare portrait that only carries a URL (e.g. an admin row
  // with no active character).
  characterId?: number;
  name: string;
  size: PortraitSize;
  // A pre-built portrait URL when the caller already has one; otherwise the
  // image is resolved from the character id at a crisp 128px rendition.
  src?: string;
  className?: string;
  // Optional explicit browser loading mode; omitted to use next/image's lazy default.
  loading?: 'lazy' | 'eager';
  // Preload only a single, known above-the-fold portrait on the current surface.
  preload?: boolean;
}) {
  const imageSrc = src ?? (characterId !== undefined ? characterPortraitUrl(characterId, 128) : '');

  return (
    <span className={cn('relative inline-block shrink-0', SIZE_CLASS[size], className)}>
      <EveImage
        source="eve"
        family="character-portrait"
        src={imageSrc}
        alt={name}
        width={size}
        height={size}
        loading={preload ? undefined : loading}
        preload={preload}
        decoding="async"
        className="size-full rounded-full border border-border-idle object-cover"
      />
    </span>
  );
}
