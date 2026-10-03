import { expect, test } from 'vitest';
import type { IndustryJob } from '@/features/industry-jobs/esi-projection';
import type { IndustryProfileRow } from '@/features/industry-planner/profiles/api-contract';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import { setResponsibility } from '@/features/industry-planner/profiles/responsibilities';
import type { AvailableStructure } from '@/features/industry-planner/types';
import {
  type CapacitySources,
  facilityForValue,
  memberCapacity,
  memberView,
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

function job(job_id: number, activity_id: number, status: IndustryJob['status'], installer_id?: number): IndustryJob {
  return {
    job_id,
    activity_id,
    status,
    installer_id,
    blueprint_type_id: 1,
    runs: 1,
    start_date: '2026-09-29T00:00:00Z',
    end_date: '2026-09-30T00:00:00Z',
  };
}

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
              job(1, MFG, 'active'),
              job(2, MFG, 'ready'),
              job(3, MFG, 'delivered'),
              job(4, RESEARCH, 'paused'),
            ],
          },
        },
      ],
      [REACTOR, { data: { jobs: [job(10, REACTION, 'active')] } }],
      [SPARE, { data: { jobs: [] } }],
    ]),
    corpJobs: [
      // The same job seen in the personal and the corporation feed.
      job(2, MFG, 'ready', BUILDER),
      job(20, MFG, 'active', BUILDER),
      job(21, MFG, 'active', 999),
      job(22, REACTION, 'active', REACTOR),
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

test('the rail names each member, linked or not, with what it is responsible for', () => {
  let doc = emptyProfileDocument([
    { characterId: BUILDER, name: 'Builder (saved)' },
    { characterId: GONE, name: 'Gone' },
  ]);
  doc = setResponsibility(doc, BUILDER, 'final-assembly', true);
  doc = setResponsibility(doc, BUILDER, 'components', true);
  const [builder, gone] = railMembers(doc, [{ characterId: BUILDER, name: 'Builder', portraitUrl: 'p/101' }]);
  expect(builder).toMatchObject({ name: 'Builder', portraitUrl: 'p/101', linked: true });
  expect(roleLine(builder!)).toBe('Components · Final assembly');
  expect(gone).toMatchObject({ name: 'Gone', portraitUrl: null, linked: false });
  expect(roleLine(gone!)).toBe('No responsibilities');
});

const structure = (overrides: Partial<AvailableStructure>): AvailableStructure => ({
  id: 's1',
  source: 'custom',
  name: 'Sotiyo',
  structureTypeId: 35827,
  groupId: 1404,
  systemId: null,
  // Hull: −1% material, −3% job cost, −15% time.
  structureAttrs: { 2600: 0.99, 2601: 0.97, 2602: 0.85 },
  // One rig: −2% material and −20% time before the security multiplier (×2.1 in null-sec).
  rigAttrs: [{ 2594: -2, 2593: -20, 2355: 1, 2356: 1.9, 2357: 2.1 }],
  enteredBonuses: null,
  securityClass: null,
  taxPct: 1.5,
  ...overrides,
});

test('a picked facility becomes a named reference, and gone or unchanged picks change nothing', () => {
  const list = [structure({ id: 'corp:5', name: 'Azbel' })];
  expect(facilityForValue('structure:corp:5', null, list)).toEqual({ id: 'corp:5', name: 'Azbel' });
  expect(facilityForValue('', { id: 'corp:5', name: 'Azbel' }, list)).toBeNull();
  // Re-picking the unavailable entry that stands for the current facility keeps it.
  expect(facilityForValue('structure:gone', { id: 'gone', name: 'Old Fort' }, list)).toBeUndefined();
  expect(facilityForValue('structure:corp:9', null, list)).toBeUndefined();
});
