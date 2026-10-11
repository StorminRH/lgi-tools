import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { AddCharacter } from './AddCharacter';
import { HealthLine, SystemName } from './board-bits';
import type { BoardTileModel } from './board-view-model';
import { PortraitRail, RailEntry } from './focus-rail';

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
    <PortraitRail label="Pilots">
      {pilots.map((pilot, index) => (
        <RailPilot key={pilot.characterId} pilot={pilot} main={index === 0} onSelect={onSelect} />
      ))}
      <AddCharacter placement="rail" />
    </PortraitRail>
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
    <RailEntry
      characterId={pilot.characterId}
      name={pilot.name}
      portraitUrl={pilot.portraitUrl}
      main={main}
      tileAttribute="data-pilot-id"
      onSelect={onSelect}
      nameAccessory={
        pilot.online !== null && (
          <span className="inline-flex shrink-0 max-lg:hidden">
            <StatusDot state={pilot.online ? 'online' : 'offline'} />
            <span className="sr-only">{pilot.online ? 'Online' : 'Offline'}</span>
          </span>
        )
      }
    >
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
    </RailEntry>
  );
}
