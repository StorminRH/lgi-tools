import { expect, test } from 'vitest';
import { jobImage } from '@/data/eve-data/type-images';
import { industryJob } from './__tests__/job-fixture';
import {
  corpEntityIds,
  corpGroupState,
  jobRowFrameData,
  jobRowModel,
  jobsCardModel,
  jobsSubtitle,
  runnerName,
} from './job-view';

const NOW = Date.parse('2026-06-12T12:00:00Z');

test('a job row headlines the product, or the blueprint without one, counts down only while active, and shows the bar for active and paused', () => {
  const product = jobRowModel(industryJob(), NOW);
  expect(product.headlineId).toBe(587);
  expect(product.icon).toEqual(jobImage(1, 587, 691));

  const blueprint = jobRowModel(industryJob({ product_type_id: undefined }), NOW);
  expect(blueprint.headlineId).toBe(691);
  expect(blueprint.icon).toEqual(jobImage(1, undefined, 691));

  expect(jobRowModel(industryJob({ end_date: '2026-06-12T13:00:00Z' }), NOW).remainingMs).toBe(3_600_000);
  expect(jobRowModel(industryJob({ status: 'paused' }), NOW).remainingMs).toBeNull();
  expect(jobRowModel(industryJob({ end_date: 'not-a-date' }), NOW).remainingMs).toBeNull();

  expect(jobRowModel(industryJob({ status: 'active' }), NOW).showBar).toBe(true);
  expect(jobRowModel(industryJob({ status: 'paused' }), NOW).showBar).toBe(true);
  expect(jobRowModel(industryJob({ status: 'ready' }), NOW).showBar).toBe(false);
});

test('the row frame resolves the headline name or falls back to Type N, labels activity 9 as a reaction, and leaves the countdown blank without a finite end', () => {
  const data = jobRowFrameData(industryJob({ end_date: '2026-06-12T13:00:00Z' }), { '587': 'Ishkur' }, NOW);
  expect(data.headlineName).toBe('Ishkur');
  expect(data.runs).toBe(10);
  expect(data.activityLabel).toBe('Manufacturing');
  expect(data.remainingLabel).toMatch(/^done in /);
  expect(data.meta.label).toBe('Active');
  expect(data.showBar).toBe(true);

  expect(jobRowFrameData(industryJob({ activity_id: 9 }), {}, NOW).activityLabel).toBe('Reaction');

  const paused = jobRowFrameData(industryJob({ status: 'paused' }), {}, NOW);
  expect(paused.remainingLabel).toBe('');
  expect(paused.headlineName).toBe('Type 587');
});

test('a runner is named, or Character N, or Unknown pilot when the installer is absent', () => {
  expect(runnerName(42, { '42': 'Karaka' })).toBe('Karaka');
  expect(runnerName(42, {})).toBe('Character 42');
  expect(runnerName(undefined, {})).toBe('Unknown pilot');
});

test('the subtitle pluralizes and appends ready and paused clauses only when non-zero', () => {
  expect(jobsSubtitle({ total: 1, readyCount: 0, pausedCount: 0, nextEndAt: null })).toBe('1 job');
  expect(jobsSubtitle({ total: 3, readyCount: 1, pausedCount: 2, nextEndAt: null })).toBe('3 jobs · 1 ready · 2 paused');
});

test('a card model is inert before the first sync, summarizes a synced board, and marks a zero board empty', () => {
  expect(jobsCardModel(null, NOW)).toEqual({ isEmpty: false, subtitle: null, nextDoneMs: null });
  expect(jobsCardModel({ jobs: [industryJob({ end_date: '2026-06-12T13:00:00Z' })] }, NOW)).toEqual({
    isEmpty: false,
    subtitle: '1 job',
    nextDoneMs: 3_600_000,
  });
  expect(jobsCardModel({ jobs: [] }, NOW).isEmpty).toBe(true);
});

test('corp entity ids collect corporation and installer ids, deduped, sorted and capped', () => {
  const corps = [
    { corporationId: 5000, data: { jobs: [industryJob({ installer_id: 20 }), industryJob({ installer_id: 10 })] } },
    { corporationId: 6000, data: null },
  ];
  expect(corpEntityIds(corps, 100)).toEqual([10, 20, 5000, 6000]);
  expect(corpEntityIds(corps, 2)).toEqual([10, 20]);
});

test('a corporation group is needs-role, sync-error, empty or rows', () => {
  expect(corpGroupState({ syncError: 'needs_role', data: null })).toBe('needs-role');
  expect(corpGroupState({ syncError: null, data: null })).toBe('sync-error');
  expect(corpGroupState({ syncError: null, data: { jobs: [] } })).toBe('empty');
  expect(corpGroupState({ syncError: null, data: { jobs: [industryJob()] } })).toBe('rows');
});
