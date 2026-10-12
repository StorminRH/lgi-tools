import { expect, test, vi } from 'vitest';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { corpCredentials, firstCorpCredential, type CorpCredential, type CorpCredentialsEnd } from './credential';

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

/** Drains the roster: every credential it yields, and why it stopped. */
async function drain(
  generator: AsyncGenerator<CorpCredential, CorpCredentialsEnd>,
): Promise<{ yielded: CorpCredential[]; end: CorpCredentialsEnd }> {
  const yielded: CorpCredential[] = [];
  let next = await generator.next();
  while (!next.done) {
    yielded.push(next.value);
    next = await generator.next();
  }
  return { yielded, end: next.value };
}

test('yields every sufficient member in roster order, judging each only when asked for', async () => {
  const probe = fakeProbe((characterId) => (characterId === 2 ? ['Accountant'] : ['Director']), (characterId) => characterId !== 3);
  const generator = corpCredentials([1, 2, 3, 4], REQUIRED, probe);

  expect((await generator.next()).value).toEqual({ characterId: 1, accessToken: 'tok-1' });
  expect(probe.vendToken).toHaveBeenCalledTimes(1);
  expect(probe.readRoles).toHaveBeenCalledTimes(1);

  const rest = await drain(generator);
  expect(rest.yielded).toEqual([{ characterId: 4, accessToken: 'tok-4' }]);
  expect(rest.end).toEqual({ kind: 'unavailable' });
  expect(probe.vendToken).toHaveBeenCalledTimes(4);
  expect(probe.readRoles).toHaveBeenCalledTimes(3);
});

test('ends denied for a fully judged roster and unavailable when a member cannot be judged', async () => {
  expect(await drain(corpCredentials([1, 2, 3], REQUIRED, fakeProbe(() => ['Accountant'])))).toEqual({
    yielded: [],
    end: { kind: 'denied' },
  });

  const unvendable = fakeProbe(() => [], (characterId) => characterId !== 2);
  expect((await drain(corpCredentials([1, 2], REQUIRED, unvendable))).end).toEqual({ kind: 'unavailable' });
  expect(unvendable.readRoles).toHaveBeenCalledTimes(1);

  const unreadable = fakeProbe((characterId) => (characterId === 2 ? null : []));
  expect((await drain(corpCredentials([1, 2], REQUIRED, unreadable))).end).toEqual({ kind: 'unavailable' });

  const empty = fakeProbe(() => ['Director']);
  expect((await drain(corpCredentials([], REQUIRED, empty))).end).toEqual({ kind: 'unavailable' });
  expect(empty.vendToken).not.toHaveBeenCalled();

  const error = new EsiBudgetExhaustedError(0);
  const failing = fakeProbe(() => []);
  failing.readRoles.mockRejectedValueOnce(error);
  await expect(drain(corpCredentials([1, 2], REQUIRED, failing))).rejects.toBe(error);
});

test('firstCorpCredential takes the first sufficient member and judges nobody after it', async () => {
  const late = fakeProbe((characterId) => (characterId === 2 ? ['Director'] : []));
  expect(await firstCorpCredential([1, 2, 3], REQUIRED, late)).toEqual({ characterId: 2, accessToken: 'tok-2' });
  expect(late.readRoles).toHaveBeenCalledTimes(2);

  expect(await firstCorpCredential([1, 2], REQUIRED, fakeProbe(() => ['Accountant']))).toBeNull();
});
