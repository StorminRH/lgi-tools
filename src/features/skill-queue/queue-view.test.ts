import { describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from './esi-projection';
import { entryRowModel } from './queue-view';

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
