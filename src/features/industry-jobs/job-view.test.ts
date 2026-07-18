import { describe, expect, it } from 'vitest';
import { jobImage } from '@/data/eve-data/type-images';
import type { IndustryJob } from './esi-projection';
import {
  activeJobStatusText,
  corpEntityIds,
  corpGroupState,
  formatEndDate,
  jobRowFrameData,
  jobRowModel,
  jobsCardModel,
  jobsSubtitle,
  runnerName,
} from './job-view';

const NOW = Date.parse('2026-06-12T12:00:00Z');

function job(overrides: Partial<IndustryJob>): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 691,
    product_type_id: 587,
    runs: 10,
    status: 'active',
    start_date: '2026-06-12T00:00:00Z',
    end_date: '2026-06-13T00:00:00Z',
    ...overrides,
  };
}

describe('jobRowModel', () => {
  it('prefers the product as the headline, falling back to the blueprint', () => {
    const product = jobRowModel(job({}), NOW);
    expect(product.headlineId).toBe(587);
    expect(product.icon).toEqual(jobImage(587, 691));

    const blueprint = jobRowModel(job({ product_type_id: undefined }), NOW);
    expect(blueprint.headlineId).toBe(691);
    expect(blueprint.icon).toEqual(jobImage(undefined, 691));
  });

  it('reports remaining ms only while active with a finite end', () => {
    expect(jobRowModel(job({ end_date: '2026-06-12T13:00:00Z' }), NOW).remainingMs).toBe(3_600_000);
    expect(jobRowModel(job({ status: 'paused' }), NOW).remainingMs).toBeNull();
    expect(jobRowModel(job({ end_date: 'not-a-date' }), NOW).remainingMs).toBeNull();
  });

  it('shows the bar only for active or paused jobs', () => {
    expect(jobRowModel(job({ status: 'active' }), NOW).showBar).toBe(true);
    expect(jobRowModel(job({ status: 'paused' }), NOW).showBar).toBe(true);
    expect(jobRowModel(job({ status: 'ready' }), NOW).showBar).toBe(false);
  });
});

describe('jobRowFrameData', () => {
  it('builds the resolved-name row bundle, or a Type# fallback', () => {
    const data = jobRowFrameData(job({ end_date: '2026-06-12T13:00:00Z' }), { '587': 'Ishkur' }, NOW);
    expect(data.headlineName).toBe('Ishkur');
    expect(data.icon).toEqual(jobImage(587, 691));
    expect(data.runs).toBe(10);
    expect(data.remainingLabel).toMatch(/^done in /);
    expect(data.meta.label).toBe('Active');
    expect(data.showBar).toBe(true);
  });

  it('leaves an empty countdown label off an active job with no finite end', () => {
    expect(jobRowFrameData(job({ status: 'paused' }), {}, NOW).remainingLabel).toBe('');
    expect(jobRowFrameData(job({}), {}, NOW).headlineName).toBe('Type #587');
  });
});

describe('runnerName', () => {
  it('resolves a present installer, falls back to Pilot#, or Unknown when absent', () => {
    expect(runnerName(42, { '42': 'Karaka' })).toBe('Karaka');
    expect(runnerName(42, {})).toBe('Pilot #42');
    expect(runnerName(undefined, {})).toBe('Unknown pilot');
  });
});

describe('activeJobStatusText', () => {
  it('shows the countdown when remaining, else the capitalized status', () => {
    expect(activeJobStatusText('active', 3_600_000)).toMatch(/1h|60m/);
    expect(activeJobStatusText('paused', null)).toBe('Paused');
    expect(activeJobStatusText('reverted', null)).toBe('Reverted');
  });
});

describe('formatEndDate', () => {
  it('formats as EVE YYYY.MM.DD HH:MM in local time', () => {
    // Assert the structure without pinning the tz-dependent hour.
    expect(formatEndDate('2026-06-13T00:00:00Z')).toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
  });

  it('returns the raw string for an unparseable date', () => {
    expect(formatEndDate('not-a-date')).toBe('not-a-date');
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
    const model = jobsCardModel({ jobs: [job({ end_date: '2026-06-12T13:00:00Z' })] }, NOW);
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
      { corporationId: 5000, data: { jobs: [job({ installer_id: 20 }), job({ installer_id: 10 })] } },
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
    expect(corpGroupState({ syncError: null, data: { jobs: [job({})] } })).toBe('rows');
  });
});
