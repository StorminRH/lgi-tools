import { expect, test } from 'vitest';
import { industryJob } from '@/features/industry-jobs/__tests__/job-fixture';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { setMemberCategories } from '@/features/industry-planner/profiles/assignments';
import {
  type CapacitySources,
  memberCapacity,
  memberView,
  poolFigure,
  poolSummaries,
  profileHref,
  railMembers,
  resolveSelection,
  roleLine,
} from './workspace-model';

const BUILDER = 101;
const REACTOR = 102;
const SPARE = 103;
const GONE = 104;
const MFG = 1;
const REACTION = 11;
const RESEARCH = 3;

function capacitiesFor(sources: CapacitySources, ids: number[]) {
  return new Map(ids.map((id) => [id, memberCapacity(id, sources)]));
}

test('slot pools count each character once, dedupe jobs, and never add two teams together', () => {
  const sources: CapacitySources = {
    levelsByCharacter: new Map<number, Record<string, number> | null>([
      [BUILDER, { 3387: 4, 24625: 3, 3406: 1 }],
      [REACTOR, { 45748: 5, 45749: 4 }],
      [SPARE, { 3387: 1 }],
    ]),
    personalJobs: new Map([
      [
        BUILDER,
        {
          data: {
            jobs: [
              industryJob({ job_id: 1, activity_id: MFG, status: 'active' }),
              industryJob({ job_id: 2, activity_id: MFG, status: 'ready' }),
              industryJob({ job_id: 3, activity_id: MFG, status: 'delivered' }),
              industryJob({ job_id: 4, activity_id: RESEARCH, status: 'paused' }),
            ],
          },
        },
      ],
      [REACTOR, { data: { jobs: [industryJob({ job_id: 10, activity_id: REACTION, status: 'active' })] } }],
      [SPARE, { data: { jobs: [] } }],
    ]),
    corpJobs: [
      // The same job seen in the personal and the corporation feed.
      industryJob({ job_id: 2, activity_id: MFG, status: 'ready', installer_id: BUILDER }),
      industryJob({ job_id: 20, activity_id: MFG, status: 'active', installer_id: BUILDER }),
      industryJob({ job_id: 21, activity_id: MFG, status: 'active', installer_id: 999 }),
      industryJob({ job_id: 22, activity_id: REACTION, status: 'active', installer_id: REACTOR }),
    ],
  };
  const linkedIds = new Set([BUILDER, REACTOR, SPARE]);
  const capacities = capacitiesFor(sources, [...linkedIds]);

  const pools = poolSummaries([BUILDER, REACTOR], capacities);
  // Builder 8 + reactor 1 manufacturing slots; jobs 1, 2 and 20 occupy them.
  expect(pools.manufacturing).toEqual({ capacity: 9, used: 3, unknownCapacity: 0, unknownUsed: 0 });
  expect(pools.reactions).toEqual({ capacity: 11, used: 2, unknownCapacity: 0, unknownUsed: 0 });
  expect(pools.science).toEqual({ capacity: 3, used: 1, unknownCapacity: 0, unknownUsed: 0 });

  // A second profile sharing the builder sees the same slots, not extra ones.
  const other = poolSummaries([BUILDER, SPARE], capacities);
  expect(other.manufacturing).toEqual({ capacity: 10, used: 3, unknownCapacity: 0, unknownUsed: 0 });
  // One member's own pools, as the member sheet shows them.
  expect(poolSummaries([BUILDER, BUILDER], capacities).manufacturing).toEqual({
    capacity: 8,
    used: 3,
    unknownCapacity: 0,
    unknownUsed: 0,
  });
});

test('unknown skills or jobs stay unknown instead of reading as free slots', () => {
  const noJobs: CapacitySources = {
    levelsByCharacter: new Map([[BUILDER, { 3387: 2 }]]),
    personalJobs: null,
    corpJobs: [],
  };
  const pools = poolSummaries([BUILDER, SPARE], capacitiesFor(noJobs, [BUILDER, SPARE]));
  expect(pools.manufacturing).toEqual({ capacity: 3, used: 0, unknownCapacity: 1, unknownUsed: 2 });
  // Usage no one knows reads "?", and capacity still syncing reads "3+".
  expect(poolFigure(pools.manufacturing)).toBe('?/3+');
});

test('a pool figure always reads used over total, with "?" for what is not known', () => {
  expect(poolFigure({ capacity: 10, used: 3, unknownCapacity: 0, unknownUsed: 0 })).toBe('3/10');
  // Skills synced but the job feed unread: the total stays beside an unknown usage.
  expect(poolFigure({ capacity: 10, used: 0, unknownCapacity: 0, unknownUsed: 1 })).toBe('?/10');
  expect(poolFigure({ capacity: 0, used: 0, unknownCapacity: 1, unknownUsed: 1 })).toBe('?/?');
  // Jobs read but skills not synced yet: the known usage still shows.
  expect(poolFigure({ capacity: 0, used: 2, unknownCapacity: 1, unknownUsed: 0 })).toBe('2/?');
});

const row = (id: string, members: number[]): IndustryProfileRow => ({
  id,
  name: id,
  revision: 1,
  document: emptyProfileDocument(members.map((characterId) => ({ characterId, name: String(characterId) }))),
  updatedAt: '2026-09-29T00:00:00.000Z',
});

test('the link picks the profile, the remembered profile fills in, and a dead link says so', () => {
  const profiles = [row('caps', [BUILDER, REACTOR]), row('rx', [REACTOR])];
  expect(resolveSelection(profiles, 'rx', 'caps')).toEqual({ profile: profiles[1], missingProfileId: null });
  expect(resolveSelection(profiles, null, 'rx').profile?.id).toBe('rx');
  expect(resolveSelection(profiles, null, 'deleted').profile?.id).toBe('caps');
  expect(resolveSelection(profiles, 'deleted', 'rx')).toEqual({ profile: profiles[1], missingProfileId: 'deleted' });
  expect(resolveSelection([], 'caps', null)).toEqual({ profile: null, missingProfileId: 'caps' });

  expect(profileHref('/industry', '?profile=rx&character=102&from=nav', 'caps')).toBe('/industry?profile=caps&from=nav');
  expect(profileHref('/industry', '?profile=rx', null)).toBe('/industry');
});

test('a member on the profile opens on its own; anything else shows the whole profile', () => {
  const caps = row('caps', [BUILDER, REACTOR]).document;
  expect(memberView(String(REACTOR), caps)).toEqual({ view: 'character', characterId: REACTOR });
  expect(memberView(String(SPARE), caps)).toEqual({ view: 'overview' });
  expect(memberView('102abc', caps)).toEqual({ view: 'overview' });
  expect(memberView(null, caps)).toEqual({ view: 'overview' });
  expect(memberView(String(REACTOR), null)).toEqual({ view: 'overview' });
});

test('the rail names each member, linked or not, with what it builds', () => {
  let doc = emptyProfileDocument([
    { characterId: BUILDER, name: 'Builder (saved)' },
    { characterId: GONE, name: 'Gone' },
  ]);
  doc = setMemberCategories(doc, BUILDER, ['capital-ships', 'advanced-components']);
  const [builder, gone] = railMembers(doc, [{ characterId: BUILDER, name: 'Builder', portraitUrl: 'p/101' }]);
  expect(builder).toMatchObject({ name: 'Builder', portraitUrl: 'p/101', linked: true });
  expect(roleLine(builder!)).toBe('Capital ships · Advanced components');
  expect(gone).toMatchObject({ name: 'Gone', portraitUrl: null, linked: false });
  expect(roleLine(gone!)).toBe('Nothing assigned');
});
