'use client';

// The one character portrait used everywhere (MIGRATE.A) — a round avatar with a
// live online dot at the top-right. Round, bordered, modeled on the home-roster
// tiles, so every surface (the live cards, the roster, /characters, the nav, the
// corp board, admin) renders the same portrait. The online dot is read from the
// OnlineStatusProvider context by characterId: a green dot shows only when the
// character is online — offline or unknown shows no dot at all. Only the viewer's
// OWN characters are in the map; any other character — corp jobmate, admin view,
// the maintainer — isn't, and shows no dot.
//
// Shared zone (not ui/): it's character-domain-aware (reads the online context),
// so it composes the domain-agnostic StatusDot primitive rather than living
// beside it. House style: className-only, no JSX style.
import { deriveOnlineState } from '@/features/online-status/online-state';
import { characterPortraitUrl } from '@/lib/eve-image';
import { EveImage } from './eve-image';
import { cn } from './ui/cn';
import { StatusDot } from './ui/status-dot';
import { useOnlineFlag } from './OnlineStatusProvider';

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
  // The character's id, used to read its online dot from context and (absent a
  // `src`) to build the image URL. Optional for the rare portrait that only
  // carries a URL (e.g. an admin row with no active character) — those never
  // show a dot, which is correct since they aren't the viewer's own character.
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
  // The hook must run unconditionally; a sentinel id never collides with a real
  // character, so an id-less portrait simply reads `unknown` → no dot.
  const online = deriveOnlineState(useOnlineFlag(characterId ?? -1));
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
      {online === 'online' && (
        // Bare pulsing green dot, no backing rail — shown only while online (an
        // offline/unknown character shows nothing). The % inset scales with the
        // portrait size to reach the circle's top-right edge; the fixed 2px
        // outward nudge then lifts it a smidge off the round edge (a consistent
        // gap at every size).
        <StatusDot
          state={online}
          className="absolute top-[7%] right-[7%] translate-x-[2px] -translate-y-[2px]"
        />
      )}
    </span>
  );
}
