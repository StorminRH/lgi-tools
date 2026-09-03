import type { IndustryJob, JobStatus } from './esi-projection';

export function deriveJobStatus(status: JobStatus, endDate: string, nowMs: number): JobStatus {
  if (status !== 'active') return status;
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return status;
  return end <= nowMs ? 'ready' : status;
}

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
