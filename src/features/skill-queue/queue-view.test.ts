import { describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from './esi-projection';
import { entryRowModel, queueCardModel } from './queue-view';

const NOW = Date.parse('2026-06-12T12:00:00Z');

function entry(overrides: Partial<SkillQueueEntry>): SkillQueueEntry {
  return {
    skill_id: 3339,
    queue_position: 0,
    finished_level: 5,
    start_date: '2026-06-12T00:00:00Z',
    finish_date: '2026-06-13T00:00:00Z',
    ...overrides,
  };
}

describe('queueCardModel', () => {
  it('is inert for a never-synced character (data:null)', () => {
    expect(queueCardModel(null, NOW)).toEqual({ isEmpty: false, subtitle: null, header: null });
  });

  it('builds the SP subtitle, appending unallocated only when present', () => {
    expect(queueCardModel({ entries: [], totalSp: 5_000_000 }, NOW).subtitle).toMatch(/SP$/);
    expect(
      queueCardModel({ entries: [], totalSp: 5_000_000, unallocatedSp: 10_000 }, NOW).subtitle,
    ).toMatch(/unallocated$/);
  });

  it('marks a synced-but-zero queue empty and gives no header', () => {
    const model = queueCardModel({ entries: [], totalSp: 1 }, NOW);
    expect(model.isEmpty).toBe(true);
    expect(model.header).toBeNull();
  });

  it('reports an ends-in header while actively training', () => {
    const model = queueCardModel(
      { entries: [entry({ finish_date: '2026-06-12T13:00:00Z' })], totalSp: 1 },
      NOW,
    );
    expect(model.header).toEqual({ kind: 'ends-in', ms: 3_600_000 });
  });

  it('reports a paused header when the whole queue is paused', () => {
    const model = queueCardModel(
      { entries: [entry({ start_date: undefined, finish_date: undefined })], totalSp: 1 },
      NOW,
    );
    expect(model.header).toEqual({ kind: 'paused' });
  });
});

describe('entryRowModel', () => {
  it('surfaces the tone/label meta and the training bar + countdown', () => {
    const model = entryRowModel(entry({ finish_date: '2026-06-12T13:00:00Z' }), NOW);
    expect(model.status).toBe('training');
    expect(model.meta.label).toBe('Training');
    expect(model.showBar).toBe(true);
    expect(model.remainingMs).toBe(3_600_000);
  });

  it('shows no bar or countdown for a done entry', () => {
    const model = entryRowModel(entry({ finish_date: '2026-06-10T00:00:00Z' }), NOW);
    expect(model.status).toBe('done');
    expect(model.showBar).toBe(false);
    expect(model.remainingMs).toBeNull();
  });
});
