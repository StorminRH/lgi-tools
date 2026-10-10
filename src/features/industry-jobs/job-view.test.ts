import { describe, expect, it } from 'vitest';
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

describe('jobRowModel', () => {
  it('prefers the product headline, counts remaining only while active, and shows the bar for active/paused', () => {
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
});

describe('jobRowFrameData', () => {
  it('builds the resolved-name row bundle, or a Type N fallback', () => {
    const data = jobRowFrameData(industryJob({ end_date: '2026-06-12T13:00:00Z' }), { '587': 'Ishkur' }, NOW);
    expect(data.headlineName).toBe('Ishkur');
    expect(data.icon).toEqual(jobImage(1, 587, 691));
    expect(data.runs).toBe(10);
    expect(data.remainingLabel).toMatch(/^done in /);
    expect(data.meta.label).toBe('Active');
    expect(data.showBar).toBe(true);
  });

  it('leaves an empty countdown label off an active job with no finite end', () => {
    expect(jobRowFrameData(industryJob({ status: 'paused' }), {}, NOW).remainingLabel).toBe('');
    expect(jobRowFrameData(industryJob(), {}, NOW).headlineName).toBe('Type 587');
  });
});

describe('runnerName', () => {
  it('resolves a present installer, falls back to Character N, or Unknown when absent', () => {
    expect(runnerName(42, { '42': 'Karaka' })).toBe('Karaka');
    expect(runnerName(42, {})).toBe('Character 42');
    expect(runnerName(undefined, {})).toBe('Unknown pilot');
  });
});

describe('jobsSubtitle', () => {
  it('pluralizes and appends ready/paused clauses only when non-zero', () => {
    expect(jobsSubtitle({ total: 1, readyCount: 0, pausedCount: 0, nextEndAt: null })).toBe('1 job');
    expect(jobsSubtitle({ total: 3, readyCount: 1, pausedCount: 2, nextEndAt: null })).toBe(
      '3 jobs · 1 ready · 2 paused',
    );
  });
});

describe('jobsCardModel', () => {
  it('is inert for a never-synced character (data:null)', () => {
    expect(jobsCardModel(null, NOW)).toEqual({ isEmpty: false, subtitle: null, nextDoneMs: null });
  });

  it('reports empty + a subtitle + the next-done countdown for a synced board', () => {
    const model = jobsCardModel({ jobs: [industryJob({ end_date: '2026-06-12T13:00:00Z' })] }, NOW);
    expect(model.isEmpty).toBe(false);
    expect(model.subtitle).toBe('1 job');
    expect(model.nextDoneMs).toBe(3_600_000);
  });

  it('marks a synced-but-zero board empty', () => {
    expect(jobsCardModel({ jobs: [] }, NOW).isEmpty).toBe(true);
  });
});

describe('corpEntityIds', () => {
  it('collects corp + installer ids, deduped, sorted, and capped', () => {
    const corps = [
      { corporationId: 5000, data: { jobs: [industryJob({ installer_id: 20 }), industryJob({ installer_id: 10 })] } },
      { corporationId: 6000, data: null },
    ];
    expect(corpEntityIds(corps, 100)).toEqual([10, 20, 5000, 6000]);
    expect(corpEntityIds(corps, 2)).toEqual([10, 20]);
  });
});

describe('corpGroupState', () => {
  it('discriminates needs-role, sync-error, empty, and rows', () => {
    expect(corpGroupState({ syncError: 'needs_role', data: null })).toBe('needs-role');
    expect(corpGroupState({ syncError: null, data: null })).toBe('sync-error');
    expect(corpGroupState({ syncError: null, data: { jobs: [] } })).toBe('empty');
    expect(corpGroupState({ syncError: null, data: { jobs: [industryJob()] } })).toBe('rows');
  });
});
