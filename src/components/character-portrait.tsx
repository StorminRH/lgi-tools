'use client';

// The one character portrait used everywhere (MIGRATE.A) — a round avatar with a
// live online dot at the top-right. Round, bordered, modeled on the home-roster
// tiles, so every surface (the live cards, the roster, /characters, the nav, the
// corp board, admin) renders the same portrait. The online dot is read from the
// OnlineStatusProvider context by characterId: it lights green (online) / muted
// (offline) only for the viewer's OWN characters; any other character — corp
// jobmate, admin view, the maintainer — isn't in the map and shows no dot.
//
// Shared zone (not ui/): it's character-domain-aware (reads the online context),
// so it composes the domain-agnostic StatusDot primitive rather than living
// beside it. House style: className-only, no JSX style.
import { deriveOnlineState } from '@/features/online-status/online-state';
import { characterPortraitUrl } from '@/lib/eve-image';
import { cn } from './ui/cn';
import { StatusDot } from './ui/status-dot';
import { useOnlineFlag } from './OnlineStatusProvider';

// The display sizes in use across the app, mapped to literal size utilities (a
// dynamic `size-[Npx]` can't be statically extracted by Tailwind, and the img
// needs an explicit size class because preflight forces height:auto otherwise).
export type PortraitSize = 28 | 32 | 36 | 38 | 64;

const SIZE_CLASS: Record<PortraitSize, string> = {
  28: 'size-7',
  32: 'size-8',
  36: 'size-9',
  38: 'size-[38px]',
  64: 'size-16',
};

export function CharacterPortrait({
  characterId,
  name,
  size,
  src,
  className,
  loading = 'lazy',
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
  // 'eager' for an always-above-the-fold portrait (the nav); defaults to 'lazy'.
  loading?: 'lazy' | 'eager';
}) {
  // The hook must run unconditionally; a sentinel id never collides with a real
  // character, so an id-less portrait simply reads `unknown` → no dot.
  const online = deriveOnlineState(useOnlineFlag(characterId ?? -1));
  const imageSrc = src ?? (characterId !== undefined ? characterPortraitUrl(characterId, 128) : '');

  return (
    <span className={cn('relative inline-block shrink-0', SIZE_CLASS[size], className)}>
      <img
        src={imageSrc}
        alt={name}
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        className="size-full rounded-full border border-border-idle object-cover"
      />
      {online !== 'unknown' && (
        // Bare pulsing dot, no backing rail. The % inset scales with the
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
