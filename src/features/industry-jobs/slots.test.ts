import { expect, test } from 'vitest';
import { industryJob } from './__tests__/job-fixture';
import { countUsedSlots, slotCapacity } from './slots';

const CHARACTER = 501;

test('slotCapacity adds the two slot skills per activity to a base of 1, failing open when levels never synced', () => {
  expect(slotCapacity({ '3387': 4, '24625': 3, '3406': 5, '45748': 2 })).toEqual({
    manufacturing: 8,
    science: 6,
    reactions: 3,
  });
  expect(
    slotCapacity({ '3387': 5, '24625': 5, '3406': 5, '24624': 5, '45748': 5, '45749': 5 }),
  ).toEqual({ manufacturing: 11, science: 11, reactions: 11 });
  expect(slotCapacity(null)).toEqual({ manufacturing: 1, science: 1, reactions: 1 });
});

test('countUsedSlots dedupes personal and installed corp jobs, counts both reaction ids, and frees settled jobs', () => {
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
  expect(countUsedSlots(CHARACTER, personal, corp)).toEqual({ manufacturing: 1, science: 1, reactions: 1 });

  // Reactions count under both activity ids: 9 from live ESI, 11 from the SDE.
  const reactions = [
    industryJob({ job_id: 1, activity_id: 9, installer_id: CHARACTER }),
    industryJob({ job_id: 2, activity_id: 11, installer_id: CHARACTER }),
  ];
  expect(countUsedSlots(CHARACTER, [], reactions).reactions).toBe(2);

  // A corp job with no installer_id cannot be attributed.
  expect(countUsedSlots(CHARACTER, [], [industryJob({ job_id: 3, activity_id: 1 })])).toEqual({
    manufacturing: 0,
    science: 0,
    reactions: 0,
  });

  const mixed = [
    industryJob({ job_id: 4, activity_id: 1, status: 'paused' }),
    industryJob({ job_id: 5, activity_id: 1, status: 'ready' }),
    industryJob({ job_id: 6, activity_id: 1, status: 'cancelled' }),
    industryJob({ job_id: 7, activity_id: 1, status: 'reverted' }),
  ];
  expect(countUsedSlots(CHARACTER, mixed, []).manufacturing).toBe(2);
});
