import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { EmptyState } from '@/components/ui/empty-state';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatQuantity } from '@/lib/format/number';
import { type CurrentTraining, romanLevel } from '../progress';
import {
  idleTrainingText,
  rosterFreeSp,
  rosterSpFallback,
  type RosterViewModel,
} from '../roster-view-model';

function PlayGlyph() {
  return (
    <svg width="7" height="8" viewBox="0 0 7 8" aria-hidden className="fill-isk shrink-0">
      <path d="M0 0l7 4-7 4z" />
    </svg>

  );
}

function PauseGlyph() {
  return (
    <svg width="6" height="8" viewBox="0 0 6 8" aria-hidden className="fill-tone-orange shrink-0">
      <rect x="0" width="2" height="8" />
      <rect x="4" width="2" height="8" />
    </svg>

  );
}

export function RosterCard({
  vm,
  reconnectAction,
}: {
  vm: RosterViewModel;

  reconnectAction?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <CharacterPortrait characterId={vm.characterId} name={vm.name} size={38} src={vm.portraitUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display font-bold text-h3 leading-tight text-name truncate">
            {vm.name}
          </span>

          {vm.needsReconnect &&
            (reconnectAction ?? <Pill tone="orange">Reconnect</Pill>)}

        </div>

        <SpLine vm={vm} />
        <TrainingLine vm={vm} />
      </div>

    </div>

  );
}

function SpLine({ vm }: { vm: RosterViewModel }) {
  if (vm.totalSp === null) {
    return <div className="font-data text-micro leading-tight text-muted">{rosterSpFallback(vm)}</div>;

  }
  const free = rosterFreeSp(vm);
  return (
    <div className="font-data text-micro leading-tight text-muted">
      {formatQuantity(vm.totalSp)} SP
      {free !== null && <span className="text-isk"> · {formatQuantity(free)} free</span>}

    </div>

  );
}

function TrainingLine({ vm }: { vm: RosterViewModel }) {
  if (!vm.hasData) {
    return <EmptyState>No queue synced yet</EmptyState>;

  }
  const t = vm.training;
  if (t.kind === 'empty' || t.kind === 'complete') {
    return <div className="mt-1 text-micro text-muted">{idleTrainingText(t.kind)}</div>;

  }
  return <ActiveOrPausedLine vm={vm} training={t} />;
}

function ActiveOrPausedLine({
  vm,
  training,
}: {
  vm: RosterViewModel;
  training: Extract<CurrentTraining, { kind: 'paused' | 'training' }>;
}) {
  const skillLabel = (
    <span className="text-name truncate flex-1 min-w-0">
      {vm.currentSkillName ?? `Skill #${training.skillId}`}{' '}
      <span className="text-muted">{romanLevel(training.level)}</span>

    </span>

  );

  if (training.kind === 'paused') {
    return (
      <div className="mt-1 flex items-center gap-2 text-ui">
        <PauseGlyph />
        {skillLabel}
        <Pill tone="orange">Paused</Pill>

      </div>

    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2 text-ui">
        <PlayGlyph />
        {skillLabel}
        {vm.remainingLabel !== null && (
          <span className="font-data text-micro text-muted shrink-0">{vm.remainingLabel}</span>

        )}
      </div>

      <div className="mt-1">
        <ProgressBar pct={training.pct} tone="evb" />
      </div>

    </div>

  );
}
