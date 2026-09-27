import { ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import { type BoardTileModel, pilotTransitionName } from './board-view-model';
import { HealthLine, SystemName } from './board-bits';

/** One pilot floating on the backdrop: the whole portrait and readout block is the button. */
export function BoardTile({ tile, onOpen }: { tile: BoardTileModel; onOpen: (characterId: number) => void }) {
  return (
    <Button
      variant="bare"
      data-pilot-id={tile.characterId}
      onClick={() => onOpen(tile.characterId)}
      className="group relative w-full items-center gap-4 rounded-card p-2 text-left"
    >
      <ViewTransition name={pilotTransitionName(tile.characterId)} share="morph" default="none">
        <span className="shrink-0 rounded-full transition-[box-shadow,translate] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow">
          <CharacterPortrait
            characterId={tile.characterId}
            name={tile.name}
            size={112}
            src={tile.portraitUrl}
            className="max-sm:size-20"
          />
        </span>
      </ViewTransition>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-h3 font-bold leading-tight text-name transition-colors group-hover:text-isk-bright">
            {tile.name}
          </span>
          {tile.online !== null && (
            <>
              <StatusDot state={tile.online ? 'online' : 'offline'} className="shrink-0" />
              <span className="sr-only">{tile.online ? 'Online' : 'Offline'}</span>
            </>
          )}
        </span>
        <TileNumbers tile={tile} />
        {tile.training !== null && (
          <TrainingLine training={tile.training} skillName={tile.skillName} remainingLabel={tile.remainingLabel} />
        )}
        <span className="flex items-baseline justify-between gap-2 text-micro">
          <HealthLine health={tile.health} />
          {tile.needsReconnect ? (
            <Pill tone="orange">Reconnect</Pill>
          ) : (
            tile.system !== null && <SystemName system={tile.system} />
          )}
        </span>
      </span>
    </Button>
  );
}

function TileNumbers({ tile }: { tile: BoardTileModel }) {
  if (tile.isk === null && tile.totalSp === null) return null;
  return (
    <span className="flex gap-3 font-data text-micro leading-tight text-muted">
      {tile.isk !== null && <span className="text-isk">{formatIsk(tile.isk)} ISK</span>}
      {tile.totalSp !== null && <span>{formatCompactQuantity(tile.totalSp)} SP</span>}
    </span>
  );
}
