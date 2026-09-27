import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { formatIsk } from '@/lib/format/isk';
import { formatCompactQuantity } from '@/lib/format/number';
import type { BoardTileModel } from './board-view-model';
import { HealthLine, SystemName } from './board-bits';

export function BoardTile({
  tile,
  selected,
  onSelect,
}: {
  tile: BoardTileModel;
  selected: boolean;
  onSelect: (characterId: number) => void;
}) {
  return (
    <Button
      variant="bare"
      aria-pressed={selected}
      onClick={() => onSelect(tile.characterId)}
      className={cn(
        'relative w-[84%] max-w-[320px] shrink-0 snap-start flex-col items-stretch gap-2.5 rounded-card border p-3 text-left md:w-auto md:max-w-none',
        'transition-[border-color,background-color,box-shadow] hover:border-border-active',
        selected
          ? 'border-isk-sub bg-isk-selected shadow-card-hover'
          : 'border-border-soft bg-bg-deep/60',
      )}
    >
      <div className="flex items-center gap-2.5">
        <CharacterPortrait characterId={tile.characterId} name={tile.name} size={38} src={tile.portraitUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-h3 font-bold leading-tight text-name truncate">{tile.name}</span>
            {tile.online !== null && (
              <StatusDot state={tile.online ? 'online' : 'offline'} className="shrink-0" />
            )}
            {tile.online !== null && <span className="sr-only">{tile.online ? 'Online' : 'Offline'}</span>}
          </div>
          <TileNumbers tile={tile} />
        </div>
      </div>
      {tile.training !== null && (
        <TrainingLine training={tile.training} skillName={tile.skillName} remainingLabel={tile.remainingLabel} />
      )}
      <div className="flex items-baseline justify-between gap-2 text-micro">
        <HealthLine health={tile.health} />
        {tile.needsReconnect ? (
          <Pill tone="orange">Reconnect</Pill>
        ) : (
          tile.system !== null && <SystemName system={tile.system} />
        )}
      </div>
    </Button>
  );
}

function TileNumbers({ tile }: { tile: BoardTileModel }) {
  if (tile.isk === null && tile.totalSp === null) return null;
  return (
    <div className="flex gap-2 font-data text-micro leading-tight text-muted">
      {tile.isk !== null && <span className="text-isk">{formatIsk(tile.isk)} ISK</span>}
      {tile.totalSp !== null && <span>{formatCompactQuantity(tile.totalSp)} SP</span>}
    </div>
  );
}
