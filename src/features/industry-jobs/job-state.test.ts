import { expect, test } from 'vitest';
import { industryJob } from './__tests__/job-fixture';
import { deriveJobStatus, jobProgress, summarizeJobs } from './job-state';

const NOW = Date.parse('2026-06-12T12:00:00Z');

test("deriveJobStatus completes an 'active' job at its end despite ESI's lazy status, and nothing else", () => {
  expect(deriveJobStatus('active', '2026-06-12T11:00:00Z', NOW)).toBe('ready');
  // The exact end instant is ready.
  expect(deriveJobStatus('active', '2026-06-12T12:00:00Z', NOW)).toBe('ready');
  expect(deriveJobStatus('active', '2026-06-12T13:00:00Z', NOW)).toBe('active');
  // A paused job never completes, even past its original end date.
  expect(deriveJobStatus('paused', '2026-06-12T11:00:00Z', NOW)).toBe('paused');
  expect(deriveJobStatus('ready', '2026-06-12T13:00:00Z', NOW)).toBe('ready');
  expect(deriveJobStatus('delivered', '2026-06-12T11:00:00Z', NOW)).toBe('delivered');
  expect(deriveJobStatus('active', 'not-a-date', NOW)).toBe('active');
});

test('jobProgress interpolates active jobs, freezes paused ones, completes settled ones and zeroes bad dates', () => {
  expect(jobProgress(industryJob(), NOW)).toBeCloseTo(50);
  expect(jobProgress(industryJob({ start_date: '2026-06-11T00:00:00Z', end_date: '2026-06-12T00:00:00Z' }), NOW)).toBe(100);
  expect(jobProgress(industryJob({ status: 'paused', pause_date: '2026-06-12T06:00:00Z' }), NOW)).toBeCloseTo(25);
  expect(jobProgress(industryJob({ status: 'paused' }), NOW)).toBe(0);
  expect(jobProgress(industryJob({ status: 'ready' }), NOW)).toBe(100);
  expect(jobProgress(industryJob({ status: 'delivered' }), NOW)).toBe(100);
  expect(jobProgress(industryJob({ start_date: 'bogus' }), NOW)).toBe(0);
  expect(
    jobProgress(industryJob({ start_date: '2026-06-13T00:00:00Z', end_date: '2026-06-12T00:00:00Z' }), NOW),
  ).toBe(0);
});

test('summarizeJobs counts statuses and reports the soonest pending completion, or none', () => {
  const summary = summarizeJobs(
    [
      industryJob({ job_id: 1, end_date: '2026-06-13T00:00:00Z' }),
      industryJob({ job_id: 2, end_date: '2026-06-12T18:00:00Z' }),
      industryJob({ job_id: 3, status: 'ready' }),
      industryJob({ job_id: 4, status: 'paused' }),
    ],
    NOW,
  );
  expect(summary).toEqual({
    total: 4,
    readyCount: 1,
    pausedCount: 1,
    nextEndAt: Date.parse('2026-06-12T18:00:00Z'),
  });
  expect(summarizeJobs([], NOW).nextEndAt).toBeNull();
  expect(summarizeJobs([industryJob({ status: 'ready' })], NOW).nextEndAt).toBeNull();
});
