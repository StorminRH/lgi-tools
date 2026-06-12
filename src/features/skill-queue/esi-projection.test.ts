import { describe, expect, it } from 'vitest';
import { parseSkillQueueBody, parseSkillsBody } from './esi-projection';

// Shapes mirror the live ESI spec (see esi-projection.ts header).
const fullEntry = {
  skill_id: 3339,
  queue_position: 0,
  finished_level: 5,
  start_date: '2026-06-10T12:00:00Z',
  finish_date: '2026-06-20T12:00:00Z',
  level_start_sp: 45255,
  level_end_sp: 256000,
  training_start_sp: 51000,
};

describe('parseSkillQueueBody', () => {
  it('accepts a full active-queue entry', () => {
    expect(parseSkillQueueBody([fullEntry])).toEqual([fullEntry]);
  });

  it('accepts a paused-queue entry (dates and SP fields absent)', () => {
    const paused = { skill_id: 3339, queue_position: 0, finished_level: 5 };
    expect(parseSkillQueueBody([paused])).toEqual([paused]);
  });

  it('accepts an empty queue', () => {
    expect(parseSkillQueueBody([])).toEqual([]);
  });

  it('sorts entries by queue_position', () => {
    const a = { ...fullEntry, queue_position: 2, skill_id: 1 };
    const b = { ...fullEntry, queue_position: 0, skill_id: 2 };
    const c = { ...fullEntry, queue_position: 1, skill_id: 3 };
    expect(parseSkillQueueBody([a, b, c])?.map((e) => e.skill_id)).toEqual([2, 3, 1]);
  });

  it('strips unknown keys rather than failing on them', () => {
    const withExtra = { ...fullEntry, some_new_esi_field: true };
    expect(parseSkillQueueBody([withExtra])).toEqual([fullEntry]);
  });

  it('returns null when a required field is missing', () => {
    expect(parseSkillQueueBody([{ skill_id: 1, queue_position: 0 }])).toBeNull();
  });

  it('returns null on a non-array body', () => {
    expect(parseSkillQueueBody({ error: 'token is expired' })).toBeNull();
  });
});

describe('parseSkillsBody', () => {
  it('projects the totals and drops the per-skill array', () => {
    const body = {
      total_sp: 52_500_000,
      unallocated_sp: 150_000,
      skills: [{ skill_id: 3339, trained_skill_level: 5, active_skill_level: 5, skillpoints_in_skill: 256000 }],
    };
    expect(parseSkillsBody(body)).toEqual({ totalSp: 52_500_000, unallocatedSp: 150_000 });
  });

  it('omits unallocatedSp when ESI omits it', () => {
    expect(parseSkillsBody({ total_sp: 5_000, skills: [] })).toEqual({ totalSp: 5_000 });
  });

  it('returns null when total_sp is missing', () => {
    expect(parseSkillsBody({ skills: [] })).toBeNull();
  });
});
