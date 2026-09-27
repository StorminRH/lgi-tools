import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { type CurrentTraining, romanLevel } from '../progress';

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

const IDLE_TEXT = { empty: 'No skills queued', complete: 'Training complete' } as const;

export function TrainingLine({
  training,
  skillName,
  remainingLabel,
}: {
  training: CurrentTraining;
  skillName: string | null;
  remainingLabel: string | null;
}) {
  if (training.kind === 'empty' || training.kind === 'complete') {
    return <div className="text-ui text-muted">{IDLE_TEXT[training.kind]}</div>;
  }
  const label = (
    <span className="text-name truncate flex-1 min-w-0">
      {skillName ?? `Skill #${training.skillId}`}{' '}
      <span className="text-muted">{romanLevel(training.level)}</span>
    </span>
  );
  if (training.kind === 'paused') {
    return (
      <div className="flex items-center gap-2 text-ui">
        <PauseGlyph />
        {label}
        <Pill tone="orange">Paused</Pill>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 text-ui">
        <PlayGlyph />
        {label}
        {remainingLabel !== null && (
          <span className="font-data text-micro text-muted shrink-0">{remainingLabel}</span>
        )}
      </div>
      <div className="mt-1.5">
        <ProgressBar pct={training.pct} tone="evb" />
      </div>
    </div>
  );
}
