import { ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { cn } from '@/components/ui/cn';
import { StatusDot } from '@/components/ui/status-dot';
import type { BoardCharacter } from '@/composition/board/api-contract';
import { pilotTransitionName } from '../board-motion';
import { characterAge, characterSecurityClass, readyData } from '../board-view-model';
import { EntityLogo } from './EntityLogo';

/** Portrait and identity details shared by character sheets. */
export function CharacterIdentity({
  character,
  now,
  dimmed = false,
}: {
  character: Pick<BoardCharacter, 'characterId' | 'name' | 'portraitUrl' | 'corporation' | 'alliance' | 'profile' | 'status'>;
  now: number;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 xl:flex-col xl:items-start">
      <ViewTransition name={pilotTransitionName(character.characterId)} share="morph" default="none">
        <CharacterPortrait
          characterId={character.characterId}
          name={character.name}
          size={160}
          src={character.portraitUrl}
          className={cn('max-xl:size-24', dimmed ? 'opacity-50 grayscale' : 'shadow-cta-glow')}
        />
      </ViewTransition>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="font-display text-h2 font-bold leading-tight text-name">{character.name}</h2>
        <Affiliation character={character} />
        <IdentityLine character={character} now={now} />
      </div>
    </div>
  );
}

function Affiliation({ character }: { character: Pick<BoardCharacter, 'corporation' | 'alliance'> }) {
  const { corporation, alliance } = character;
  if (corporation === null && alliance === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui text-text">
      {corporation !== null && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <EntityLogo kind="corporation" id={corporation.id} name={corporation.name ?? 'Corporation'} />
          <span className="truncate">{corporation.name ?? 'Unknown corporation'}</span>
        </span>
      )}
      {alliance !== null && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <EntityLogo kind="alliance" id={alliance.id} name={alliance.name ?? 'Alliance'} />
          <span className="truncate">{alliance.name ?? 'Unknown alliance'}</span>
        </span>
      )}
    </div>
  );
}

function IdentityLine({ character, now }: { character: Pick<BoardCharacter, 'profile' | 'status'>; now: number }) {
  const profile = readyData(character.profile);
  const status = readyData(character.status);
  const age = profile !== null ? characterAge(profile.birthday, now) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-micro text-muted">
      {profile !== null && (
        <span>
          Sec{' '}
          <span className={characterSecurityClass(profile.securityStatus)}>
            {profile.securityStatus === null ? '—' : profile.securityStatus.toFixed(1)}
          </span>
        </span>
      )}
      {age !== null && <span>{age} old</span>}
      {status !== null && (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot state={status.online ? 'online' : 'offline'} />
          {status.online ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}
