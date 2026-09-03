import type { Tone } from '@/components/ui/tones';
import {
  jobImage,
  type EveImageDescriptor,
} from '@/data/eve-data/type-images';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob, JobStatus } from './esi-projection';
import { JOB_STATUS_META, jobActivityLabel } from './industry-jobs-styles';
import { type JobsSummary, jobProgress, summarizeJobs } from './job-state';
import type { CharacterJobsData } from './types';

export interface JobRowModel {
  headlineId: number;
  icon: EveImageDescriptor;
  remainingMs: number | null;
  showBar: boolean;
}

export function jobRowModel(job: IndustryJob, now: number): JobRowModel {
  const end = Date.parse(job.end_date);
  return {
    headlineId: job.product_type_id ?? job.blueprint_type_id,
    icon: jobImage(job.activity_id, job.product_type_id, job.blueprint_type_id),
    remainingMs: job.status === 'active' && Number.isFinite(end) ? end - now : null,
    showBar: job.status === 'active' || job.status === 'paused',
  };
}

export interface JobRowFrameData {
  headlineName: string;
  icon: EveImageDescriptor;
  runs: number;
  activityLabel: string;
  remainingLabel: string;
  meta: { label: string; tone: Tone };
  showBar: boolean;
  pct: number;
}

export function jobRowFrameData(
  job: IndustryJob,
  names: Record<string, string>,
  now: number,
): JobRowFrameData {
  const { headlineId, icon, remainingMs, showBar } = jobRowModel(job, now);
  return {
    headlineName: names[String(headlineId)] ?? `Type #${headlineId}`,
    icon,
    runs: job.runs,
    activityLabel: jobActivityLabel(job.activity_id),
    remainingLabel: remainingMs !== null ? `done in ${formatRemaining(remainingMs)}` : '',
    meta: JOB_STATUS_META[job.status],
    showBar,
    pct: jobProgress(job, now),
  };
}

export function runnerName(installerId: number | undefined, entityNames: Record<string, string>): string {
  if (installerId === undefined) return 'Unknown pilot';
  return entityNames[String(installerId)] ?? `Pilot #${installerId}`;
}

export function activeJobStatusText(status: JobStatus, remainingMs: number | null): string {
  if (remainingMs !== null) return formatRemaining(remainingMs);
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

export function formatEndDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function jobsSubtitle(summary: JobsSummary): string {
  const count = summary.total === 1 ? '1 job' : `${summary.total} jobs`;
  const ready = summary.readyCount > 0 ? ` · ${summary.readyCount} ready` : '';
  const paused = summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : '';
  return `${count}${ready}${paused}`;
}

export interface JobsCardModel {
  isEmpty: boolean;
  subtitle: string | null;
  nextDoneMs: number | null;
}

export function jobsCardModel(data: CharacterJobsData | null, now: number): JobsCardModel {
  if (data === null) return { isEmpty: false, subtitle: null, nextDoneMs: null };
  const summary = summarizeJobs(data.jobs, now);
  return {
    isEmpty: data.jobs.length === 0,
    subtitle: jobsSubtitle(summary),
    nextDoneMs: summary.nextEndAt !== null ? summary.nextEndAt - now : null,
  };
}

export function corpEntityIds(
  corporations: Array<{ corporationId: number; data: CharacterJobsData | null }>,
  maxIds: number,
): number[] {
  const set = new Set<number>();
  for (const corp of corporations) {
    set.add(corp.corporationId);
    for (const job of corp.data?.jobs ?? []) {
      if (job.installer_id !== undefined) set.add(job.installer_id);
    }
  }
  return [...set].sort((a, b) => a - b).slice(0, maxIds);
}

export type CorpGroupState = 'needs-role' | 'sync-error' | 'empty' | 'rows';

export function corpGroupState(corp: { syncError: string | null; data: CharacterJobsData | null }): CorpGroupState {
  if (corp.syncError === 'needs_role') return 'needs-role';
  if (corp.data === null) return 'sync-error';
  return corp.data.jobs.length === 0 ? 'empty' : 'rows';
}
