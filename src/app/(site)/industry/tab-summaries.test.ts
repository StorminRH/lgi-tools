import { describe, expect, it } from 'vitest';
import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import type { SavedPlanRow } from '@/features/industry-planner/api-contract';
import { type TabSummaryInputs, tabSummaries } from './tab-summaries';

function job(job_id: number, status: IndustryJob['status']): IndustryJob {
  return {
    job_id,
    activity_id: 1,
    blueprint_type_id: 999,
    runs: 1,
    status,
    start_date: '2026-09-01T00:00:00Z',
    end_date: '2026-09-02T00:00:00Z',
  } as IndustryJob;
}

function plan(id: string, favorite = false): SavedPlanRow {
  return {
    id,
    name: `Plan ${id}`,
    favorite,
    blueprintTypeId: 1,
    productTypeId: 2,
    productName: 'Rifter',
    snapshot: { v: 1, blueprintTypeId: 1 },
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

const base: TabSummaryInputs = {
  signedIn: true,
  jobs: { loading: false, failed: false, list: [] },
  slots: null,
  recent: [],
  plans: [],
  plansFailed: false,
  watchlist: [],
};

const text = (lines: ReturnType<typeof tabSummaries>[keyof ReturnType<typeof tabSummaries>]) =>
  lines.map((segments) => segments.map((segment) => segment.text).join(''));

describe('tabSummaries — jobs', () => {
  it('asks a signed-out visitor to sign in', () => {
    expect(text(tabSummaries({ ...base, signedIn: false }).jobs)).toEqual(['Sign in to follow live jobs']);
  });

  it('shows the sync and failure states', () => {
    expect(text(tabSummaries({ ...base, jobs: { loading: true, failed: false, list: [] } }).jobs)).toEqual(['Syncing…']);
    expect(tabSummaries({ ...base, jobs: { loading: false, failed: true, list: [] } }).jobs[0]?.[0]?.tone).toBe('warn');
  });

  it('lights the ready count and adds slot usage', () => {
    const jobs = tabSummaries({
      ...base,
      jobs: { loading: false, failed: false, list: [job(1, 'ready'), job(2, 'active'), job(3, 'active')] },
      slots: {
        manufacturing: { used: 2, total: 10 },
        science: { used: 1, total: 5 },
        reactions: { used: 0, total: 3 },
      },
    }).jobs;
    expect(text(jobs)).toEqual(['1 ready · 2 running', '3/18 slots in use']);
    expect(jobs[0]?.[0]?.tone).toBe('isk');
  });

  it('says so when nothing is running', () => {
    expect(text(tabSummaries(base).jobs)).toEqual(['No jobs running']);
  });
});

describe('tabSummaries — plans, research, templates', () => {
  it('offers to continue the latest plan', () => {
    const plan = tabSummaries({ ...base, recent: [{ typeId: 1, productTypeId: 2, name: 'Raven' }] }).plan;
    expect(text(plan)).toEqual(['Continue Raven']);
    expect(tabSummaries(base).plan.map((l) => l[0]?.text)).toEqual(['Pick a blueprint to plan']);
  });

  it('stays quiet until browser storage has been read', () => {
    const unread = tabSummaries({ ...base, recent: null, watchlist: null, plans: null });
    expect(unread.plan).toEqual([]);
    expect(unread.research).toEqual([]);
    expect(unread.templates).toEqual([]);
  });

  it('counts watched products', () => {
    const watched = [{ typeId: 1, productTypeId: 2, name: 'Raven' }];
    expect(text(tabSummaries({ ...base, watchlist: watched }).research)).toEqual(['1 watched']);
    expect(text(tabSummaries(base).research)).toEqual(['Find what to build']);
  });

  it('counts saved templates and favorites', () => {
    expect(text(tabSummaries({ ...base, plans: [plan('a', true), plan('b')] }).templates)).toEqual(['2 saved · 1 ★']);
    expect(text(tabSummaries({ ...base, plans: [plan('a')] }).templates)).toEqual(['1 saved']);
    expect(text(tabSummaries(base).templates)).toEqual(['None saved yet']);
    expect(text(tabSummaries({ ...base, plansFailed: true }).templates)).toEqual(['Couldn’t load templates']);
    expect(text(tabSummaries({ ...base, signedIn: false }).templates)).toEqual(['Sign in to save templates']);
  });
});
