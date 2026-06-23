// One character row in the home roster: portrait + name, total/free SP, and a
// single "training now" line (active skill + time-remaining + progress bar, a
// paused pill, or an idle/unsynced note). Purely presentational — it branches on
// the prebuilt view model only, so the ?demo seed renders the exact same tree.
import { Card } from '@/components/ui/card';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { formatQuantity } from '@/lib/format/number';
import { romanLevel } from '../progress';
import type { RosterViewModel } from '../roster-view-model';

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

export function RosterCard({ vm }: { vm: RosterViewModel }) {
  return (
    <Card className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <img
          src={vm.portraitUrl}
          alt={vm.name}
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="rounded-[2px] border border-border-idle shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display font-bold text-[15px] text-name truncate">{vm.name}</span>
            {vm.needsReconnect && <Pill tone="orange">Reconnect</Pill>}
          </div>
          <SpLine vm={vm} />
        </div>
      </div>
      <TrainingLine vm={vm} />
    </Card>
  );
}

function SpLine({ vm }: { vm: RosterViewModel }) {
  if (vm.totalSp === null) {
    return (
      <div className="font-mono text-[11px] text-muted">
        {vm.needsReconnect ? 'Reconnect to sync' : 'No data yet'}
      </div>
    );
  }
  return (
    <div className="font-mono text-[11px] text-muted">
      {formatQuantity(vm.totalSp)} SP
      {vm.unallocatedSp !== null && vm.unallocatedSp > 0 && (
        <span className="text-isk"> · {formatQuantity(vm.unallocatedSp)} free</span>
      )}
    </div>
  );
}

function TrainingLine({ vm }: { vm: RosterViewModel }) {
  if (!vm.hasData) {
    return <div className="mt-2.5 text-[11px] text-empty">No queue synced yet</div>;
  }
  const t = vm.training;
  if (t.kind === 'empty') return <div className="mt-2.5 text-[11px] text-muted">No skills queued</div>;
  if (t.kind === 'complete') {
    return <div className="mt-2.5 text-[11px] text-muted">Training complete</div>;
  }

  const skillLabel = (
    <span className="text-name truncate flex-1 min-w-0">
      {vm.currentSkillName ?? `Skill #${t.skillId}`}{' '}
      <span className="text-muted">{romanLevel(t.level)}</span>
    </span>
  );

  if (t.kind === 'paused') {
    return (
      <div className="mt-2.5 flex items-center gap-2 text-[12px]">
        <PauseGlyph />
        {skillLabel}
        <Pill tone="orange">Paused</Pill>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2 text-[12px]">
        <PlayGlyph />
        {skillLabel}
        {vm.remainingLabel !== null && (
          <span className="font-mono text-[10px] text-muted shrink-0">{vm.remainingLabel}</span>
        )}
      </div>
      <div className="mt-[5px]">
        <ProgressBar pct={t.pct} />
      </div>
    </div>
  );
}
