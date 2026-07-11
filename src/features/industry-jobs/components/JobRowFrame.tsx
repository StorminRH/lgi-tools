// The shared job-row markup for the personal jobs panel + the corp board. The two rows
// build the identical grid (headline · runs/activity · countdown · status pill · optional
// progress bar) and differ only in the bar tone (corp uses the EVE-industry-blue 'evb')
// and an optional trailing footer (the corp runner attribution) — so the markup lives
// here once. Feature-local: both consumers are industry-jobs components. The pure row
// data comes from jobRowFrameData (job-view.ts).
import type { ReactNode } from 'react';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { JobRowFrameData } from '../job-view';

export function JobRowFrame({
  headlineName,
  runs,
  activityLabel,
  remainingLabel,
  meta,
  showBar,
  pct,
  barTone,
  footer,
}: JobRowFrameData & { barTone?: 'default' | 'evb'; footer?: ReactNode }) {
  return (
    <div className="border-t border-border-soft px-3.5 py-[6px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-[6px] text-[12px]">
        <span className="text-name truncate leading-[1.5]">
          {headlineName}{' '}
          <span className="text-muted">
            ×{runs} · {activityLabel}
          </span>
        </span>
        <span className="text-[10px] text-muted shrink-0">{remainingLabel}</span>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {showBar && (
        <div className="mt-[4px]">
          <ProgressBar pct={pct} tone={barTone} />
        </div>
      )}
      {footer}
    </div>
  );
}
