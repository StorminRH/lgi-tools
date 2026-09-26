import { describe, expect, it, vi } from 'vitest';
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

const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

describe('selectCorpCredential', () => {
  it.each([1, 5, 20])('stops at a sufficient first member of %i (one vend, one roles read)', async (count) => {
    const probe = fakeProbe(() => ['Director']);

    const selection = await selectCorpCredential(ids(count), REQUIRED, probe);

    expect(selection).toEqual({ kind: 'sufficient', characterId: 1, accessToken: 'tok-1' });
    expect(probe.vendToken).toHaveBeenCalledTimes(1);
    expect(probe.readRoles).toHaveBeenCalledTimes(1);
  });

  it('probes all 20 members when only the last is sufficient', async () => {
    const probe = fakeProbe((characterId) => (characterId === 20 ? ['Director'] : []));

    const selection = await selectCorpCredential(ids(20), REQUIRED, probe);

    expect(selection).toEqual({ kind: 'sufficient', characterId: 20, accessToken: 'tok-20' });
    expect(probe.vendToken).toHaveBeenCalledTimes(20);
    expect(probe.readRoles).toHaveBeenCalledTimes(20);
  });

  it('is denied when every member is evaluated and none holds a required role', async () => {
    const probe = fakeProbe(() => ['Accountant']);

    expect(await selectCorpCredential([1, 2, 3], REQUIRED, probe)).toEqual({ kind: 'denied' });
  });

  it('is unavailable when a non-director shares the corp with an unvendable member', async () => {
    const probe = fakeProbe(() => [], (characterId) => characterId !== 2);

    expect(await selectCorpCredential([1, 2], REQUIRED, probe)).toEqual({ kind: 'unavailable' });
    expect(probe.readRoles).toHaveBeenCalledTimes(1);
  });

  it('is unavailable when a non-director shares the corp with an unreadable-roles member', async () => {
    const probe = fakeProbe((characterId) => (characterId === 2 ? null : []));

    expect(await selectCorpCredential([1, 2], REQUIRED, probe)).toEqual({ kind: 'unavailable' });
  });

  it('skips an unavailable member and selects the next sufficient one', async () => {
    const probe = fakeProbe(() => ['Director'], (characterId) => characterId !== 1);

    expect(await selectCorpCredential([1, 2], REQUIRED, probe)).toEqual({
      kind: 'sufficient',
      characterId: 2,
      accessToken: 'tok-2',
    });
  });

  it('is unavailable with zero members', async () => {
    const probe = fakeProbe(() => ['Director']);

    expect(await selectCorpCredential([], REQUIRED, probe)).toEqual({ kind: 'unavailable' });
    expect(probe.vendToken).not.toHaveBeenCalled();
  });

  it('propagates a probe error unchanged', async () => {
    const error = new EsiBudgetExhaustedError(0);
    const probe = fakeProbe(() => []);
    probe.readRoles.mockRejectedValueOnce(error);

    await expect(selectCorpCredential([1, 2], REQUIRED, probe)).rejects.toBe(error);
  });
});
