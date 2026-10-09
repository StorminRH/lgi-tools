import { describe, expect, it } from 'vitest';
import { industryJob } from './__tests__/job-fixture';
import type { JobStatus } from './esi-projection';
import {
  countUsedSlots,
  jobOccupiesSlot,
  slotCapacity,
} from './slots';

describe('slotCapacity', () => {
  it('computes 1 + the two slot skills per activity', () => {

    expect(
      slotCapacity({ '3387': 4, '24625': 3, '3406': 5, '45748': 2 }),
    ).toEqual({ manufacturing: 8, science: 6, reactions: 3 });
  });

  it('fails open to base 1/1/1 when levels were never synced (null)', () => {
    expect(slotCapacity(null)).toEqual({ manufacturing: 1, science: 1, reactions: 1 });
  });

  it('treats a present map with no slot skills as rank 0 across the board', () => {
    expect(slotCapacity({})).toEqual({ manufacturing: 1, science: 1, reactions: 1 });
  });

  it('caps naturally at 11 per activity with everything at V', () => {
    expect(
      slotCapacity({
        '3387': 5,
        '24625': 5,
        '3406': 5,
        '24624': 5,
        '45748': 5,
        '45749': 5,
      }),
    ).toEqual({ manufacturing: 11, science: 11, reactions: 11 });
  });
});

describe('countUsedSlots', () => {
  const CHARACTER = 501;

  it('matches the hand-computed anchor: dedup, installer filter, activity 9', () => {
    const personal = [
      industryJob({ job_id: 101, activity_id: 1 }),
      industryJob({ job_id: 102, activity_id: 5 }),
      industryJob({ job_id: 103, activity_id: 1, status: 'delivered' }),
    ];
    const corp = [
      industryJob({ job_id: 101, activity_id: 1, installer_id: CHARACTER }),
      industryJob({ job_id: 201, activity_id: 9, status: 'ready', installer_id: CHARACTER }),
      industryJob({ job_id: 202, activity_id: 1, installer_id: 999 }),
    ];
    expect(countUsedSlots(CHARACTER, personal, corp)).toEqual({
      manufacturing: 1,
      science: 1,
      reactions: 1,
    });
  });

  it('counts reactions under both activity ids (9 live-ESI, 11 SDE)', () => {
    const corp = [
      industryJob({ job_id: 1, activity_id: 9, installer_id: CHARACTER }),
      industryJob({ job_id: 2, activity_id: 11, installer_id: CHARACTER }),
    ];
    expect(countUsedSlots(CHARACTER, [], corp).reactions).toBe(2);
  });

  it('skips a corp job with no installer_id — it cannot be attributed', () => {
    expect(countUsedSlots(CHARACTER, [], [industryJob({ job_id: 3, activity_id: 1 })])).toEqual({
      manufacturing: 0,
      science: 0,
      reactions: 0,
    });
  });

  it('counts paused and ready as occupying, and frees delivered / cancelled / reverted', () => {
    const occupying: JobStatus[] = ['active', 'paused', 'ready'];
    const freed: JobStatus[] = ['delivered', 'cancelled', 'reverted'];
    for (const status of occupying) expect(jobOccupiesSlot(status)).toBe(true);
    for (const status of freed) expect(jobOccupiesSlot(status)).toBe(false);

    const personal = [
      industryJob({ job_id: 4, activity_id: 1, status: 'paused' }),
      industryJob({ job_id: 5, activity_id: 1, status: 'ready' }),
      industryJob({ job_id: 6, activity_id: 1, status: 'cancelled' }),
      industryJob({ job_id: 7, activity_id: 1, status: 'reverted' }),
    ];
    expect(countUsedSlots(CHARACTER, personal, []).manufacturing).toBe(2);
  });
});
