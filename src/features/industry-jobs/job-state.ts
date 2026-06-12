// Pure status/progress logic for industry jobs (3.4.8). ESI computes job
// status LAZILY — a fresh read can still report 'active' after end_date has
// passed — so what is true "as of" now is decided HERE from the job's own
// timestamps, never trusted from the endpoint having ticked over. The Convex
// layer imports this for the at-write derivation and the scheduled
// flip-to-ready guard (convex/industryJobs.ts); the panel imports it for
// progress display. Keeping every transition decision in pure functions makes
// the re-sync/flip interleavings unit-testable.
import type { IndustryJob, JobStatus } from './esi-projection';

// The at-write derivation: an 'active' job whose end_date has passed is
// 'ready' regardless of what ESI said. Everything else is stored verbatim —
// a paused job is not progressing, so a past end_date never completes it.
// An unparseable end_date stays verbatim (and the caller schedules no flip).
export function deriveJobStatus(status: JobStatus, endDate: string, nowMs: number): JobStatus {
  if (status !== 'active') return status;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return status;
  return end <= nowMs ? 'ready' : status;
}

// The scheduled flip's guard: which job (by index), if any, a markJobReady
// fired for (jobId, endDate) may flip. Identity-matched, never time-compared:
// the scheduler fires at end_date by construction, and a time guard that
// no-oped on a hair-early fire would orphan the job as 'active' forever
// (nothing re-fires, and ESI's lazy status keeps the body 304-identical).
//
//   - job gone from the doc (delivered/cancelled, dropped by a fresh body,
//     or the doc was wiped and re-synced without it) → null
//   - status no longer 'active' (paused meanwhile, or a duplicate flip /
//     at-write derivation already landed 'ready') → null
//   - end_date moved (pause/unpause re-priced the job; the apply that wrote
//     the new end scheduled a new flip) → null
export function findFlipTarget(
  jobs: IndustryJob[],
  jobId: number,
  endDate: string,
): number | null {
  const index = jobs.findIndex((job) => job.job_id === jobId);
  if (index === -1) return null;
  const job = jobs[index];
  if (job === undefined || job.status !== 'active') return null;
  // Verbatim ISO-string identity — zero clock semantics.
  if (job.end_date !== endDate) return null;
  return index;
}

// Completion of a job, 0–100, for the progress bar. Active interpolates by
// time; paused freezes at the pause timestamp; ready/delivered are done;
// cancelled/reverted render no meaningful progress.
export function jobProgress(job: IndustryJob, nowMs: number): number {
  if (job.status === 'ready' || job.status === 'delivered') return 100;
  if (job.status === 'cancelled' || job.status === 'reverted') return 0;
  const start = Date.parse(job.start_date);
  const end = Date.parse(job.end_date);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  if (job.status === 'paused') {
    const paused = job.pause_date !== undefined ? Date.parse(job.pause_date) : NaN;
    return Number.isFinite(paused) ? clampPct(((paused - start) / (end - start)) * 100) : 0;
  }
  return clampPct(((nowMs - start) / (end - start)) * 100);
}

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}

export interface JobsSummary {
  total: number;
  readyCount: number;
  pausedCount: number;
  // Soonest end among jobs still running, null when nothing is pending
  // completion — the card header's "next done in …".
  nextEndAt: number | null;
}

export function summarizeJobs(jobs: IndustryJob[], nowMs: number): JobsSummary {
  let readyCount = 0;
  let pausedCount = 0;
  let nextEndAt: number | null = null;
  for (const job of jobs) {
    if (job.status === 'ready') readyCount += 1;
    if (job.status === 'paused') pausedCount += 1;
    if (job.status === 'active') {
      const end = Date.parse(job.end_date);
      if (Number.isFinite(end) && end > nowMs && (nextEndAt === null || end < nextEndAt)) {
        nextEndAt = end;
      }
    }
  }
  return { total: jobs.length, readyCount, pausedCount, nextEndAt };
}
