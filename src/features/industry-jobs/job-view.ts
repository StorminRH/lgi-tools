// Pure view derivations for the industry-jobs surfaces (personal panel, corp board,
// active-jobs table). The panels are presentational shells; every decision they used to
// make inline (headline choice, countdown gating, subtitle/status text, the shared
// row-frame props) lives here so it is unit-tested and the JSX shells stay trivial.
import type { Tone } from '@/components/ui/tones';
import { formatRemaining } from '@/lib/format/time';
import type { IndustryJob, JobStatus } from './esi-projection';
import { JOB_STATUS_META, jobActivityLabel } from './industry-jobs-styles';
import { type JobsSummary, jobProgress, summarizeJobs } from './job-state';
import type { CharacterJobsData } from './types';

/**
 * The shared per-job row derivation across the three surfaces. headlineId = the product
 * where one exists (manufacturing / invention / reactions), else the blueprint (research
 * / copy jobs are about the blueprint itself); remainingMs = time to done, only while
 * ACTIVE with a finite end (paused / ready / delivered show none); showBar = whether a
 * progress bar renders (active or paused).
 */
export interface JobRowModel {
  headlineId: number;
  remainingMs: number | null;
  showBar: boolean;
}

export function jobRowModel(job: IndustryJob, now: number): JobRowModel {
  const end = Date.parse(job.end_date);
  return {
    headlineId: job.product_type_id ?? job.blueprint_type_id,
    remainingMs: job.status === 'active' && Number.isFinite(end) ? end - now : null,
    showBar: job.status === 'active' || job.status === 'paused',
  };
}

/**
 * The prop bundle the shared JobRowFrame renders — the personal panel and the corp board
 * build the identical set (name / runs / activity / countdown / status pill / bar), so it
 * lives here once. The corp board adds barTone + the runner footer at the call site.
 */
export interface JobRowFrameData {
  headlineName: string;
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
  const { headlineId, remainingMs, showBar } = jobRowModel(job, now);
  return {
    headlineName: names[String(headlineId)] ?? `Type #${headlineId}`,
    runs: job.runs,
    activityLabel: jobActivityLabel(job.activity_id),
    remainingLabel: remainingMs !== null ? `done in ${formatRemaining(remainingMs)}` : '',
    meta: JOB_STATUS_META[job.status],
    showBar,
    pct: jobProgress(job, now),
  };
}

/**
 * The corp runner's display name: the resolved installer name, a "Pilot #id" fallback
 * when the id is present but unresolved, or "Unknown pilot" when a legacy row carries no
 * installer id at all.
 */
export function runnerName(installerId: number | undefined, entityNames: Record<string, string>): string {
  if (installerId === undefined) return 'Unknown pilot';
  return entityNames[String(installerId)] ?? `Pilot #${installerId}`;
}

/**
 * The active-jobs table's status cell text: the countdown while active, else the
 * capitalized raw status. (The 'ready' → "Complete ✓" case is handled at the call site,
 * where the cell also swaps className.)
 */
export function activeJobStatusText(status: JobStatus, remainingMs: number | null): string {
  if (remainingMs !== null) return formatRemaining(remainingMs);
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

/** EVE's in-client end-date format (YYYY.MM.DD HH:MM), in the viewer's local tz. */
export function formatEndDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The jobs-count subtitle line: "N jobs · X ready · Y paused" (singular "1 job"; the
 * ready/paused clauses appear only when non-zero).
 */
export function jobsSubtitle(summary: JobsSummary): string {
  const count = summary.total === 1 ? '1 job' : `${summary.total} jobs`;
  const ready = summary.readyCount > 0 ? ` · ${summary.readyCount} ready` : '';
  const paused = summary.pausedCount > 0 ? ` · ${summary.pausedCount} paused` : '';
  return `${count}${ready}${paused}`;
}

/**
 * One character's jobs-card model: whether the board is empty, its subtitle line, and the
 * "next done in" countdown ms — the decisions the card shell used to make inline. A
 * never-synced character (data:null) has no subtitle/countdown and is not "empty" (that
 * is the LiveCharacterCard's no-data state, distinct from a synced-but-zero board).
 */
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

/**
 * The corp + installer ids referenced by the live corp data, for the /api/eve/names
 * resolve: every corp id, plus each job's installer id, deduped + sorted + capped.
 */
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

/**
 * One corp group's render state (the CorpGroup ladder as a discriminant): a missing
 * in-game role, a failed last sync, an empty board, or rows to render.
 */
export type CorpGroupState = 'needs-role' | 'sync-error' | 'empty' | 'rows';

export function corpGroupState(corp: { syncError: string | null; data: CharacterJobsData | null }): CorpGroupState {
  if (corp.syncError === 'needs_role') return 'needs-role';
  if (corp.data === null) return 'sync-error';
  return corp.data.jobs.length === 0 ? 'empty' : 'rows';
}
