// Pure status/progress logic for industry jobs (3.4.8). ESI computes job
// status LAZILY — a fresh read can still report 'active' after end_date has
// passed — so what is true "as of" now is decided HERE from the job's own
// timestamps, never trusted from the endpoint having ticked over. The client
// hooks (use-jobs-live / use-corp-jobs-live) import deriveJobStatus to flip a
// completed job to 'ready' on the render clock — the seam that replaced the
// Convex markReady schedulers (removed in MIGRATE.B.2/B.3); the panel imports
// the progress/summary helpers. Keeping every transition decision in pure
// functions makes the derivation unit-testable.
import type { IndustryJob, JobStatus } from './esi-projection';

/**
 * The live "ready" derivation: an 'active' job whose end_date has passed is
 * 'ready' regardless of what ESI said. Everything else is returned verbatim —
 * a paused job is not progressing, so a past end_date never completes it.
 * An unparseable end_date stays verbatim. Pure (status, end_date, now), so the
 * client can re-derive it every render-clock tick with no server round-trip.
 */
export function deriveJobStatus(status: JobStatus, endDate: string, nowMs: number): JobStatus {
  if (status !== 'active') return status;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return status;
  return end <= nowMs ? 'ready' : status;
}

/**
 * Completion of a job, 0–100, for the progress bar. Active interpolates by
 * time; paused freezes at the pause timestamp; ready/delivered are done;
 * cancelled/reverted render no meaningful progress.
 */
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
