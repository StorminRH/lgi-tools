import { beforeEach, describe, expect, it, vi } from 'vitest';

// CI skips *.db.test.ts, so these canned-row arms are the sole gate-of-record
// coverage for rowToCachedAffiliation.

let userRows: Array<{
  accountId: string;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  refreshedAt: Date | null;
}> = [];

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(userRows),
        }),
      }),
    }),
  },
}));

import { getUserAffiliations } from './affiliation-store';

const REFRESHED_AT = new Date('2026-07-15T12:00:00Z');

beforeEach(() => {
  userRows = [];
});

describe('getUserAffiliations', () => {
  it('coalesces missing affiliation fields and drops non-numeric character ids', async () => {
    userRows = [
      {
        accountId: '90000011',
        corporationId: 98000011,
        allianceId: 99000011,
        factionId: 500011,
        refreshedAt: REFRESHED_AT,
      },
      {
        accountId: '90000012',
        corporationId: null,
        allianceId: null,
        factionId: null,
        refreshedAt: null,
      },
      {
        accountId: 'not-a-number',
        corporationId: 1,
        allianceId: 2,
        factionId: 3,
        refreshedAt: REFRESHED_AT,
      },
    ];

    await expect(getUserAffiliations('user-1')).resolves.toEqual([
      {
        characterId: 90000011,
        corporationId: 98000011,
        allianceId: 99000011,
        factionId: 500011,
        refreshedAt: REFRESHED_AT,
      },
      {
        characterId: 90000012,
        corporationId: null,
        allianceId: null,
        factionId: null,
        refreshedAt: null,
      },
    ]);
  });
});
