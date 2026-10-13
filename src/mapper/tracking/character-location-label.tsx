'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { cn } from '@/components/ui/cn';
import { useSystemLabel } from '../windows/use-system-label';
import type { CharacterIdentity } from './use-character-identities';

const SUBLINE_TONE = {
  faint: 'text-faint',
  muted: 'text-muted',
} as const;

/**
 * A tracked character's portrait, name and current system, laid out by the
 * row that holds it. A character with no system reads Offline, dimmed.
 */
export function CharacterLocationLabel({
  characterId,
  identity,
  systemId,
  sublineTone,
}: {
  readonly characterId: number;
  readonly identity: CharacterIdentity;
  readonly systemId: number | null;
  /** Faint in the dock menu, beside its Auto row; muted on the prompt card. */
  readonly sublineTone: keyof typeof SUBLINE_TONE;
}) {
  const systemName = useSystemLabel(systemId)?.name;
  return (
    <>
      <CharacterPortrait
        characterId={characterId}
        name={identity.name}
        src={identity.portraitUrl}
        size={28}
        className={cn(systemId === null && 'opacity-50')}
      />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate text-name">{identity.name}</span>
        <span className={cn('truncate font-data text-micro', SUBLINE_TONE[sublineTone])}>
          {systemId === null ? 'Offline' : (systemName ?? String(systemId))}
        </span>
      </span>
    </>
  );
}
