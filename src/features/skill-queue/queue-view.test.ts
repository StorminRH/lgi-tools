import { expect, test } from 'vitest';
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

test('a training row shows the bar and countdown, and a finished row shows neither', () => {
  const training = entryRowModel(entry({ finish_date: '2026-06-12T13:00:00Z' }), NOW);
  expect(training.status).toBe('training');
  expect(training.meta.label).toBe('Training');
  expect(training.showBar).toBe(true);
  expect(training.remainingMs).toBe(3_600_000);

  const done = entryRowModel(entry({ finish_date: '2026-06-10T00:00:00Z' }), NOW);
  expect(done.status).toBe('done');
  expect(done.showBar).toBe(false);
  expect(done.remainingMs).toBeNull();
});
