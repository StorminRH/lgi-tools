import { describe, expect, it } from 'vitest';
import type { IndustryJob, JobStatus } from './esi-projection';
import {
  countUsedSlots,
  jobOccupiesSlot,
  slotCapacity,
  slotMetaTotals,
} from './slots';

function job(
  overrides: Partial<IndustryJob> & { job_id: number; activity_id: number },
): IndustryJob {
  return {
    blueprint_type_id: 999,
    runs: 1,
    status: 'active',
    start_date: '2026-07-01T00:00:00Z',
    end_date: '2026-07-02T00:00:00Z',
    ...overrides,
  };
}

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
      job({ job_id: 101, activity_id: 1 }),
      job({ job_id: 102, activity_id: 5 }),
      job({ job_id: 103, activity_id: 1, status: 'delivered' }),
    ];
    const corp = [
      job({ job_id: 101, activity_id: 1, installer_id: CHARACTER }),
      job({ job_id: 201, activity_id: 9, status: 'ready', installer_id: CHARACTER }),
      job({ job_id: 202, activity_id: 1, installer_id: 999 }),
    ];
    expect(countUsedSlots(CHARACTER, personal, corp)).toEqual({
      manufacturing: 1,
      science: 1,
      reactions: 1,
    });
  });

  it('counts reactions under both activity ids (9 live-ESI, 11 SDE)', () => {
    const corp = [
      job({ job_id: 1, activity_id: 9, installer_id: CHARACTER }),
      job({ job_id: 2, activity_id: 11, installer_id: CHARACTER }),
    ];
    expect(countUsedSlots(CHARACTER, [], corp).reactions).toBe(2);
  });

  it('skips a corp job with no installer_id — it cannot be attributed', () => {
    expect(countUsedSlots(CHARACTER, [], [job({ job_id: 3, activity_id: 1 })])).toEqual({
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
      job({ job_id: 4, activity_id: 1, status: 'paused' }),
      job({ job_id: 5, activity_id: 1, status: 'ready' }),
      job({ job_id: 6, activity_id: 1, status: 'cancelled' }),
      job({ job_id: 7, activity_id: 1, status: 'reverted' }),
    ];
    expect(countUsedSlots(CHARACTER, personal, []).manufacturing).toBe(2);
  });
});

describe('slotMetaTotals', () => {
  const boards = (entries: Array<[number, IndustryJob[] | null]>) =>
    new Map(
      entries.map(([id, jobs]) => [id, { data: jobs === null ? null : { jobs } }] as const),
    );

  it('is null while any feed is still loading', () => {
    expect(
      slotMetaTotals({
        loading: true,
        eligibleCharacterIds: [1],
        characters: [{ characterId: 1, slots: { manufacturing: 1, science: 1, reactions: 1 } }],
        personalJobsByCharacter: boards([]),
        corpJobs: [],
      }),
    ).toBeNull();
  });

  it('is null with no characters (signed out / none linked) — never errors', () => {
    expect(
      slotMetaTotals({
        loading: false,
        eligibleCharacterIds: [],
        characters: [],
        personalJobsByCharacter: boards([]),
        corpJobs: [],
      }),
    ).toBeNull();
  });

  it('sums used/total across characters, base 1/1/1 for an unsynced one', () => {

    const model = slotMetaTotals({
      loading: false,
      eligibleCharacterIds: [1, 2],
      characters: [
        { characterId: 1, slots: { manufacturing: 8, science: 6, reactions: 3 } },
        { characterId: 2, slots: { manufacturing: 1, science: 1, reactions: 1 } },
      ],
      personalJobsByCharacter: boards([
        [1, [job({ job_id: 11, activity_id: 1 })]],
        [2, null],
      ]),
      corpJobs: [job({ job_id: 21, activity_id: 9, installer_id: 2 })],
    });
    expect(model).toEqual({
      manufacturing: { used: 1, total: 9 },
      science: { used: 0, total: 7 },
      reactions: { used: 1, total: 4 },
    });
  });

  it('excludes a character whose jobs the boards cannot see (scope-ineligible)', () => {

    const model = slotMetaTotals({
      loading: false,
      eligibleCharacterIds: [1],
      characters: [
        { characterId: 1, slots: { manufacturing: 2, science: 1, reactions: 1 } },
        { characterId: 9, slots: { manufacturing: 11, science: 11, reactions: 11 } },
      ],
      personalJobsByCharacter: boards([[1, [job({ job_id: 31, activity_id: 1 })]]]),
      corpJobs: [],
    });
    expect(model).toEqual({
      manufacturing: { used: 1, total: 2 },
      science: { used: 0, total: 1 },
      reactions: { used: 0, total: 1 },
    });
  });

  it('does not admit a character on terminal corp jobs alone (freed slots)', () => {

    const model = slotMetaTotals({
      loading: false,
      eligibleCharacterIds: [1],
      characters: [
        { characterId: 1, slots: { manufacturing: 2, science: 1, reactions: 1 } },
        { characterId: 7, slots: { manufacturing: 3, science: 1, reactions: 1 } },
      ],
      personalJobsByCharacter: boards([[1, [job({ job_id: 51, activity_id: 1 })]]]),
      corpJobs: [job({ job_id: 52, activity_id: 1, status: 'delivered', installer_id: 7 })],
    });
    expect(model).toEqual({
      manufacturing: { used: 1, total: 2 },
      science: { used: 0, total: 1 },
      reactions: { used: 0, total: 1 },
    });
  });

  it('includes a personally-ineligible character who installed a visible corp job', () => {

    const model = slotMetaTotals({
      loading: false,
      eligibleCharacterIds: [1],
      characters: [
        { characterId: 1, slots: { manufacturing: 2, science: 1, reactions: 1 } },
        { characterId: 7, slots: { manufacturing: 3, science: 1, reactions: 1 } },
      ],
      personalJobsByCharacter: boards([[1, [job({ job_id: 41, activity_id: 1 })]]]),
      corpJobs: [job({ job_id: 42, activity_id: 1, installer_id: 7 })],
    });
    expect(model).toEqual({
      manufacturing: { used: 2, total: 5 },
      science: { used: 0, total: 2 },
      reactions: { used: 0, total: 2 },
    });
  });

  it('is null when no eligible character remains after the roster filter', () => {
    expect(
      slotMetaTotals({
        loading: false,
        eligibleCharacterIds: [],
        characters: [{ characterId: 9, slots: { manufacturing: 2, science: 1, reactions: 1 } }],
        personalJobsByCharacter: boards([]),
        corpJobs: [],
      }),
    ).toBeNull();
  });
});
