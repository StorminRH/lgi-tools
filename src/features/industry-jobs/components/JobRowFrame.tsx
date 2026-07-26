// The shared job-row markup for the personal jobs panel + the corp board. The two rows
// build the identical grid (headline · runs/activity · countdown · status pill · optional
// progress bar) and differ only in the bar tone (corp uses the EVE-industry-blue 'evb')
// and an optional trailing footer (the corp runner attribution) — so the markup lives
// here once. Feature-local: both consumers are industry-jobs components. The pure row
// data comes from jobRowFrameData (job-view.ts).
import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EntityRow } from '@/components/ui/row';
import { initials } from '@/lib/format/names';
import type { JobRowFrameData } from '../job-view';

/** Renders the shared status, activity, product, runs, and timing frame for one industry job. */
export function JobRowFrame({
  headlineName,
  icon,
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
      <EntityRow
        colsClass="grid-cols-[minmax(0,1fr)_auto_auto]"
        className="border-t-0 px-0 py-0 hover:bg-transparent"
        name={
          <span className="flex min-w-0 items-center gap-2 font-data">
            <TypeIcon {...icon} size={22} mono={initials(headlineName)} />
            <span className="truncate">
              {headlineName}{' '}
              <span className="text-muted">
                ×{runs} · {activityLabel}
              </span>
            </span>
          </span>
        }
        trailing={<span className="font-data">{remainingLabel}</span>}
        chips={<Pill tone={meta.tone}>{meta.label}</Pill>}
      />
      {showBar && (
        <div className="mt-[4px]">
          <ProgressBar pct={pct} tone={barTone} />
        </div>
      )}
      {footer}
    </div>
  );
}
