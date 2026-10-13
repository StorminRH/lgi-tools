import { expect, test } from 'vitest';
import { MAP_CLAIM_PURGE_BATCH } from './access-contract';
import {
  applyEliminationDoor,
  authorJumpDoor,
  mapTrackingSnapshotDoor,
  projectMapAccessDoor,
  purgeMapAccessDoor,
  purgeUserMapClaimsDoor,
} from './convex-doors';

const COUNTS = { inserted: 1, updated: 0, deleted: 0, unchanged: 2 };

test('a map access projection names a map and its users, refuses a user twice, and replies strictly', () => {
  const claims = [
    { userId: 'creator', roles: ['admin'] },
    { userId: 'member', roles: ['viewer'], characters: [{ characterId: 90_000_001, name: 'Pilot' }] },
  ];
  expect(projectMapAccessDoor.request.safeParse({ mapId: 'map-1', revision: 3, claims }).success)
    .toBe(true);
  expect(projectMapAccessDoor.request.safeParse({ mapId: '', revision: 3, claims }).success)
    .toBe(false);
  expect(projectMapAccessDoor.request.safeParse({
    mapId: 'map-1',
    revision: 3,
    claims: [{ userId: '', roles: ['viewer'] }],
  }).success).toBe(false);

  const duplicate = projectMapAccessDoor.request.safeParse({
    mapId: 'map-1',
    revision: 3,
    claims: [...claims, { userId: 'member', roles: ['editor'] }],
  });
  expect(duplicate.error?.issues).toEqual([
    expect.objectContaining({ path: ['claims', 2, 'userId'], message: 'duplicate userId' }),
  ]);

  const reply = (body: object) => projectMapAccessDoor.response.safeParse(body).success;
  expect(reply({ ...COUNTS, outcome: 'applied', characterScoped: true })).toBe(true);
  expect(reply({ ...COUNTS, outcome: 'duplicate' })).toBe(true);
  expect(reply({ ...COUNTS, outcome: 'unscoped-refused' })).toBe(true);
  expect(reply({ ...COUNTS, outcome: 'stale', characterScoped: true })).toBe(false);
  expect(reply({ ...COUNTS, outcome: 'applied', characterScoped: false })).toBe(false);
  expect(reply({ ...COUNTS, outcome: 'applied', legacy: true })).toBe(false);
});

test('user purges name a user, and claim revocations stay within one purge batch', () => {
  expect(purgeMapAccessDoor.request.safeParse({ userId: 'user-1' }).success).toBe(true);
  expect(purgeMapAccessDoor.request.safeParse({ userId: '' }).success).toBe(false);

  const revocation = (count: number) => purgeUserMapClaimsDoor.request.safeParse({
    userId: 'user-1',
    revision: 4,
    mapIds: Array.from({ length: count }, (_, index) => `map-${index}`),
  }).success;
  expect(revocation(MAP_CLAIM_PURGE_BATCH)).toBe(true);
  expect(revocation(MAP_CLAIM_PURGE_BATCH + 1)).toBe(false);
  expect(revocation(0)).toBe(false);
  expect(purgeMapAccessDoor.response.safeParse({ deleted: 2, more: true }).success).toBe(false);
});

test('a tracking snapshot reply lists only user and positive character pairs', () => {
  const reply = (tracked: unknown) => mapTrackingSnapshotDoor.response.safeParse({ tracked }).success;

  expect(reply([{ userId: 'u1', characterId: 11 }, { userId: 'u2', characterId: 22 }])).toBe(true);
  expect(reply([{ userId: 'u1', characterId: 0 }])).toBe(false);
  expect(reply([{ userId: 'u1', characterId: -11 }])).toBe(false);
  expect(reply([{ userId: 'u1', characterId: 11, mapId: 'map-1' }])).toBe(false);
  expect(mapTrackingSnapshotDoor.response.safeParse({ tracked: [], frozen: true }).success).toBe(false);
});

test('jump and elimination writes carry the matcher decision and assumed deductions', () => {
  const author = (decision: object) => authorJumpDoor.request.safeParse({
    operation: 'author',
    userId: 'user-1',
    mapId: 'map-1',
    characterId: 90_000_001,
    fromSolarSystemId: 31_000_001,
    toSolarSystemId: 31_000_002,
    transitionObservedAt: 1_800_000_000_000,
    observedShipMassKg: null,
    observationKey: 'observation-key',
    decision,
  }).success;
  expect(author({
    kind: 'resolve', candidateId: 'c-1', provenance: 'jump-verified', candidateIds: ['c-1'], survivors: ['c-1'],
  })).toBe(true);
  expect(author({ kind: 'insert', candidateIds: [], survivors: [] })).toBe(true);
  expect(author({ kind: 'resolve', provenance: 'assumed', candidateIds: [], survivors: [] })).toBe(false);
  expect(author({
    kind: 'resolve', candidateId: 'c-1', provenance: 'human', candidateIds: ['c-1'], survivors: ['c-1'],
  })).toBe(false);

  const apply = (deductions: unknown[]) => applyEliminationDoor.request.safeParse({
    operation: 'apply', userId: 'user-1', mapId: 'map-1', systemId: 31_000_001, deductions,
  }).success;
  expect(apply([
    { signatureId: 'AAA-111', typeCode: 'B274', provenance: 'assumed' },
    { signatureId: 'BBB-222', connectionId: 'c-1', provenance: 'assumed', expectedTypeCode: null },
  ])).toBe(true);
  expect(apply([])).toBe(false);
  expect(apply([{ signatureId: 'AAA-111', typeCode: 'B274', provenance: 'confirmed' }])).toBe(false);
  expect(apply([{ signatureId: 'AAA-111', typeCode: 'B274', provenance: 'assumed', extra: 1 }])).toBe(false);
});
