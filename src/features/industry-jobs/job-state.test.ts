import { describe, expect, it } from 'vitest';
import type { IndustryJob } from './esi-projection';
import {
  deriveJobStatus,
  findFlipTarget,
  flipsToSchedule,
  jobProgress,
  SCHEDULE_HORIZON_MS,
  summarizeJobs,
} from './job-state';

const NOW = Date.parse('2026-06-12T12:00:00Z');

function job(overrides: Partial<IndustryJob>): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 691,
    product_type_id: 587,
    runs: 10,
    status: 'active',
    start_date: '2026-06-12T00:00:00Z', // 12h ago
    end_date: '2026-06-13T00:00:00Z', // 12h ahead
    ...overrides,
  };
}

describe('deriveJobStatus', () => {
  it("marks an 'active' job ready once its end date passes, despite ESI's lazy status", () => {
    // The lazy-status gotcha: a fresh ESI read keeps reporting 'active'
    // until the job is delivered — completion is timestamp math here.
    expect(deriveJobStatus('active', '2026-06-12T11:00:00Z', NOW)).toBe('ready');
  });

  it('treats the exact end instant as ready', () => {
    expect(deriveJobStatus('active', '2026-06-12T12:00:00Z', NOW)).toBe('ready');
  });

  it("keeps a still-running 'active' job active", () => {
    expect(deriveJobStatus('active', '2026-06-12T13:00:00Z', NOW)).toBe('active');
  });

  it('never completes a paused job, even past its original end date', () => {
    expect(deriveJobStatus('paused', '2026-06-12T11:00:00Z', NOW)).toBe('paused');
  });

  it('stores every non-active status verbatim', () => {
    expect(deriveJobStatus('ready', '2026-06-12T13:00:00Z', NOW)).toBe('ready');
    expect(deriveJobStatus('delivered', '2026-06-12T11:00:00Z', NOW)).toBe('delivered');
  });

  it('leaves a job with an unparseable end date untouched', () => {
    expect(deriveJobStatus('active', 'not-a-date', NOW)).toBe('active');
  });
});

describe('findFlipTarget', () => {
  const jobs = [
    job({ job_id: 10, end_date: '2026-06-12T12:00:00Z' }),
    job({ job_id: 11, end_date: '2026-06-13T00:00:00Z' }),
  ];

  it('flips the exact (jobId, endDate) identity it was scheduled for', () => {
    expect(findFlipTarget(jobs, 10, '2026-06-12T12:00:00Z')).toBe(0);
  });

  it('no-ops when the job vanished from a later fresh body (delivered/cancelled)', () => {
    expect(findFlipTarget(jobs, 99, '2026-06-12T12:00:00Z')).toBeNull();
  });

  it('no-ops when the job is no longer active (paused meanwhile)', () => {
    const paused = [job({ job_id: 10, status: 'paused', end_date: '2026-06-12T12:00:00Z' })];
    expect(findFlipTarget(paused, 10, '2026-06-12T12:00:00Z')).toBeNull();
  });

  it('no-ops on a duplicate flip — the first one already landed ready', () => {
    const ready = [job({ job_id: 10, status: 'ready', end_date: '2026-06-12T12:00:00Z' })];
    expect(findFlipTarget(ready, 10, '2026-06-12T12:00:00Z')).toBeNull();
  });

  it('no-ops when a re-sync moved the end date — the newer flip owns it', () => {
    // Pause/unpause between syncs re-prices the end; the apply that wrote
    // the new end_date scheduled a new flip for it.
    expect(findFlipTarget(jobs, 10, '2026-06-12T11:00:00Z')).toBeNull();
  });
});

describe('flipsToSchedule', () => {
  it('arms every active in-horizon job on a first sync (no existing payload)', () => {
    const fresh = [job({ job_id: 1 }), job({ job_id: 2, status: 'paused' })];
    expect(flipsToSchedule(null, fresh, NOW).map((j) => j.job_id)).toEqual([1]);
  });

  it('skips a job whose (job_id, end_date) was already active — its flip is armed', () => {
    const existing = [job({ job_id: 1 })];
    const fresh = [job({ job_id: 1 }), job({ job_id: 2 })];
    expect(flipsToSchedule(existing, fresh, NOW).map((j) => j.job_id)).toEqual([2]);
  });

  it('re-arms a re-priced job (new end_date) — the old flip no-ops on identity', () => {
    const existing = [job({ job_id: 1, end_date: '2026-06-13T00:00:00Z' })];
    const fresh = [job({ job_id: 1, end_date: '2026-06-14T00:00:00Z' })];
    expect(flipsToSchedule(existing, fresh, NOW)).toHaveLength(1);
  });

  it('re-arms a job that was paused in the existing payload and is active again', () => {
    const existing = [job({ job_id: 1, status: 'paused' })];
    const fresh = [job({ job_id: 1 })];
    expect(flipsToSchedule(existing, fresh, NOW)).toHaveLength(1);
  });

  it('never arms a job already derived ready (past end_date is not active)', () => {
    // The apply derives before scheduling, so a past-end job arrives here
    // as 'ready' — the at-write derivation, not a flip, owns that case.
    const fresh = [job({ job_id: 1, status: 'ready', end_date: '2026-06-12T11:00:00Z' })];
    expect(flipsToSchedule(null, fresh, NOW)).toHaveLength(0);
  });

  it('skips unparseable and beyond-horizon end dates instead of throwing', () => {
    const fresh = [
      job({ job_id: 1, end_date: 'not-a-date' }),
      job({ job_id: 2, end_date: new Date(NOW + SCHEDULE_HORIZON_MS + 60_000).toISOString() }),
      job({ job_id: 3 }),
    ];
    expect(flipsToSchedule(null, fresh, NOW).map((j) => j.job_id)).toEqual([3]);
  });
});

describe('jobProgress', () => {
  it('interpolates an active job by time', () => {
    expect(jobProgress(job({}), NOW)).toBeCloseTo(50);
  });

  it('clamps an active job whose end date already passed', () => {
    const overdue = job({
      start_date: '2026-06-11T00:00:00Z',
      end_date: '2026-06-12T00:00:00Z',
    });
    expect(jobProgress(overdue, NOW)).toBe(100);
  });

  it('freezes a paused job at its pause timestamp', () => {
    const paused = job({ status: 'paused', pause_date: '2026-06-12T06:00:00Z' });
    expect(jobProgress(paused, NOW)).toBeCloseTo(25);
  });

  it('shows no progress for a paused job without a pause date', () => {
    expect(jobProgress(job({ status: 'paused' }), NOW)).toBe(0);
  });

  it('treats ready and delivered as complete', () => {
    expect(jobProgress(job({ status: 'ready' }), NOW)).toBe(100);
    expect(jobProgress(job({ status: 'delivered' }), NOW)).toBe(100);
  });

  it('renders no progress for unparseable or inverted dates', () => {
    expect(jobProgress(job({ start_date: 'bogus' }), NOW)).toBe(0);
    expect(
      jobProgress(job({ start_date: '2026-06-13T00:00:00Z', end_date: '2026-06-12T00:00:00Z' }), NOW),
    ).toBe(0);
  });
});

describe('summarizeJobs', () => {
  it('counts statuses and reports the soonest pending completion', () => {
    const summary = summarizeJobs(
      [
        job({ job_id: 1, end_date: '2026-06-13T00:00:00Z' }),
        job({ job_id: 2, end_date: '2026-06-12T18:00:00Z' }),
        job({ job_id: 3, status: 'ready' }),
        job({ job_id: 4, status: 'paused' }),
      ],
      NOW,
    );
    expect(summary).toEqual({
      total: 4,
      readyCount: 1,
      pausedCount: 1,
      nextEndAt: Date.parse('2026-06-12T18:00:00Z'),
    });
  });

  it('reports no pending completion for an empty or all-settled board', () => {
    expect(summarizeJobs([], NOW).nextEndAt).toBeNull();
    expect(summarizeJobs([job({ status: 'ready' })], NOW).nextEndAt).toBeNull();
  });
});
