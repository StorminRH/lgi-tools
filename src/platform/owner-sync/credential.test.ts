import { expect, test, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { selectCorpCredential } from './credential';

const REQUIRED = ['Director'];

function fakeProbe(
  rolesOf: (characterId: number) => string[] | null,
  vendable: (characterId: number) => boolean = () => true,
) {
  return {
    vendToken: vi.fn(async (characterId: number) => (vendable(characterId) ? `tok-${characterId}` : null)),
    readRoles: vi.fn(async (characterId: number) => rolesOf(characterId)),
  };
}

test('stops at the first sufficient member, including one found after skips', async () => {
  const early = fakeProbe(() => ['Director']);
  expect(await selectCorpCredential([1, 2, 3, 4, 5], REQUIRED, early)).toEqual({
    kind: 'sufficient',
    characterId: 1,
    accessToken: 'tok-1',
  });
  expect(early.vendToken).toHaveBeenCalledTimes(1);
  expect(early.readRoles).toHaveBeenCalledTimes(1);

  const late = fakeProbe((characterId) => (characterId === 4 ? ['Director'] : []));
  expect(await selectCorpCredential([1, 2, 3, 4], REQUIRED, late)).toEqual({
    kind: 'sufficient',
    characterId: 4,
    accessToken: 'tok-4',
  });
  expect(late.vendToken).toHaveBeenCalledTimes(4);
  expect(late.readRoles).toHaveBeenCalledTimes(4);

  const skipped = fakeProbe(() => ['Director'], (characterId) => characterId !== 1);
  expect(await selectCorpCredential([1, 2], REQUIRED, skipped)).toEqual({
    kind: 'sufficient',
    characterId: 2,
    accessToken: 'tok-2',
  });
});

test('denies a fully judged roster and stays unavailable when a member cannot be judged', async () => {
  const denied = fakeProbe(() => ['Accountant']);
  expect(await selectCorpCredential([1, 2, 3], REQUIRED, denied)).toEqual({ kind: 'denied' });

  const unvendable = fakeProbe(() => [], (characterId) => characterId !== 2);
  expect(await selectCorpCredential([1, 2], REQUIRED, unvendable)).toEqual({ kind: 'unavailable' });
  expect(unvendable.readRoles).toHaveBeenCalledTimes(1);

  const unreadable = fakeProbe((characterId) => (characterId === 2 ? null : []));
  expect(await selectCorpCredential([1, 2], REQUIRED, unreadable)).toEqual({ kind: 'unavailable' });

  const empty = fakeProbe(() => ['Director']);
  expect(await selectCorpCredential([], REQUIRED, empty)).toEqual({ kind: 'unavailable' });
  expect(empty.vendToken).not.toHaveBeenCalled();

  const error = new EsiBudgetExhaustedError(0);
  const failing = fakeProbe(() => []);
  failing.readRoles.mockRejectedValueOnce(error);
  await expect(selectCorpCredential([1, 2], REQUIRED, failing)).rejects.toBe(error);
});
