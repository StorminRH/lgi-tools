import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { StatusDot } from '@/components/ui/status-dot';
import { TrainingLine } from '@/features/skill-queue/components/TrainingLine';
import { HealthLine } from './board-bits';
import type { BoardTileModel } from './board-view-model';

const RING = 'shadow-cta-glow';
const HOVER_RING = 'group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow';

/**
 * The pilots, frameless on the backdrop: the main pilot large, the rest as
 * compact rows, and an overview control on top. On phones it becomes a
 * horizontal strip that scrolls on its own.
 */
export function PilotRail({
  pilots,
  selectedId,
  onSelect,
  onOverview,
}: {
  pilots: readonly BoardTileModel[];
  selectedId: number | null;
  onSelect: (characterId: number) => void;
  onOverview: () => void;
}) {
  const overview = selectedId === null;
  return (
    <nav
      aria-label="Pilots"
      className="-mx-4 flex min-w-0 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-3 lg:overflow-visible lg:pb-0"
    >
      <Button
        variant="bare"
        aria-pressed={overview}
        onClick={onOverview}
        className={cn(
          'size-12 shrink-0 justify-center self-start rounded-full border font-data text-micro uppercase tracking-copy lg:size-auto lg:px-4 lg:py-1.5',
          overview ? 'border-isk-sub text-isk shadow-cta-glow' : 'border-border-soft text-muted hover:text-isk',
        )}
      >
        <span className="lg:hidden">All</span>
        <span className="max-lg:hidden">All pilots</span>
      </Button>
      {pilots.map((pilot, index) => (
        <RailPilot
          key={pilot.characterId}
          pilot={pilot}
          main={index === 0}
          selected={pilot.characterId === selectedId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function RailPilot({
  pilot,
  main,
  selected,
  onSelect,
}: {
  pilot: BoardTileModel;
  main: boolean;
  selected: boolean;
  onSelect: (characterId: number) => void;
}) {
  return (
    <Button
      variant="bare"
      aria-pressed={selected}
      data-pilot-id={pilot.characterId}
      onClick={() => onSelect(pilot.characterId)}
      className={cn(
        'group w-16 shrink-0 flex-col gap-1.5 rounded-card text-center lg:w-full lg:text-left',
        main ? 'lg:flex-col lg:items-start lg:gap-3 lg:pb-2' : 'lg:flex-row lg:items-center lg:gap-3',
      )}
    >
      <CharacterPortrait
        characterId={pilot.characterId}
        name={pilot.name}
        size={main ? 112 : 64}
        src={pilot.portraitUrl}
        className={cn('transition-shadow duration-300 max-lg:size-12', selected ? RING : HOVER_RING)}
      />
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center justify-center gap-1.5 lg:justify-start">
          <span
            className={cn(
              'truncate font-display font-bold leading-tight transition-colors max-lg:text-micro',
              main ? 'lg:text-h3' : 'lg:text-nav',
              selected ? 'text-isk-bright' : 'text-name group-hover:text-isk-bright',
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
          {main && pilot.training !== null && (
            <TrainingLine training={pilot.training} skillName={pilot.skillName} remainingLabel={pilot.remainingLabel} />
          )}
          <HealthLine health={pilot.health} className="truncate" />
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
