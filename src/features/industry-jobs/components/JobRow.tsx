import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/type-icon';
import { Pill } from '@/components/ui/pill';
import { ProgressBar } from '@/components/ui/progress-bar';
import type { JobRowFrameData } from '../job-view';

/**
 * One industry job: what it makes, how many runs of which activity, who
 * installed it when that is not obvious, time left and status, then its
 * progress. Every job's progress reads in the same blue.
 */
export function JobRow({
  headlineName,
  icon,
  runs,
  activityLabel,
  remainingLabel,
  meta,
  showBar,
  pct,
  runner,
}: JobRowFrameData & { runner?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-soft px-3.5 py-2.5 first:border-t-0">
      <div className="flex items-center gap-2.5">
        <TypeIcon {...icon} size={22} mono={headlineName} />
        {/* On a narrow screen who and when drop under the name, so the name keeps the line. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
          <span className="min-w-0 truncate font-data text-ui text-name sm:flex-1">
            {headlineName}{' '}
            <span className="text-muted">
              ×{runs} · {activityLabel}
            </span>
          </span>
          {(runner || remainingLabel !== '') && (
            <span className="flex min-w-0 items-center gap-2.5">
              {runner}
              {remainingLabel !== '' && (
                <span className="shrink-0 font-data text-ui text-muted">{remainingLabel}</span>
              )}
            </span>
          )}
        </div>
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>
      {showBar && <ProgressBar pct={pct} tone="evb" />}
    </div>
  );
}
