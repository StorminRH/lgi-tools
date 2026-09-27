import { ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { AddCharacter } from './AddCharacter';
import { HealthLine, SystemName } from './board-bits';
import { pilotTransitionName } from './board-motion';
import type { BoardTileModel } from './board-view-model';

/**
 * The pilots, frameless on the backdrop: the main pilot large, the rest as
 * compact rows, each with what it is training, its queue state and where it
 * is, and a way to link another at the end. On phones it becomes a
 * horizontal strip of portraits that scrolls on its own.
 */
export function PilotRail({
  pilots,
  onSelect,
}: {
  pilots: readonly BoardTileModel[];
  onSelect: (characterId: number) => void;
}) {
  return (
    <nav
      aria-label="Pilots"
      className="-mx-4 flex min-w-0 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0"
    >
      {pilots.map((pilot, index) => (
        <RailPilot key={pilot.characterId} pilot={pilot} main={index === 0} onSelect={onSelect} />
      ))}
      <AddCharacter placement="rail" />
    </nav>
  );
}

function RailPilot({
  pilot,
  main,
  onSelect,
}: {
  pilot: BoardTileModel;
  main: boolean;
  onSelect: (characterId: number) => void;
}) {
  return (
    <Button
      variant="bare"
      data-pilot-id={pilot.characterId}
      onClick={() => onSelect(pilot.characterId)}
      className={cn(
        'group w-16 shrink-0 flex-col gap-1.5 rounded-card text-center lg:w-full lg:text-left',
        main ? 'lg:flex-col lg:items-start lg:gap-3' : 'lg:flex-row lg:items-start lg:gap-3',
      )}
    >
      <ViewTransition name={pilotTransitionName(pilot.characterId)} share="morph" default="none">
        <CharacterPortrait
          characterId={pilot.characterId}
          name={pilot.name}
          size={main ? 112 : 64}
          src={pilot.portraitUrl}
          className="transition-shadow duration-300 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow max-lg:size-12 lg:max-xl:size-14"
        />
      </ViewTransition>
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center justify-center gap-1.5 lg:justify-start">
          <span
            className={cn(
              'truncate font-display font-bold leading-tight text-name transition-colors group-hover:text-isk-bright max-lg:text-micro',
              main ? 'lg:text-h3' : 'lg:text-nav',
            )}
          >
            {pilot.name}
          </span>
          {pilot.online !== null && (
            <span className="inline-flex shrink-0 max-lg:hidden">
              <StatusDot state={pilot.online ? 'online' : 'offline'} />
              <span className="sr-only">{pilot.online ? 'Online' : 'Offline'}</span>
            </span>
          )}
        </span>
        <span className="hidden min-w-0 flex-col gap-1.5 text-micro lg:flex">
          {pilot.training !== null && (
            <TrainingLine training={pilot.training} skillName={pilot.skillName} remainingLabel={pilot.remainingLabel} />
          )}
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <HealthLine health={pilot.health} className="truncate" />
            {pilot.system !== null && <SystemName system={pilot.system} />}
          </span>
          {pilot.needsReconnect && (
            <span>
              <Pill tone="orange">Reconnect</Pill>
            </span>
          )}
        </span>
      </span>
    </Button>
  );
}
