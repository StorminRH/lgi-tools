import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignatureEliminationResponse } from '@/data/maps/api-contract';
import { postJumpRequest } from '../jump-client';
import { eliminateSignaturesAndAnnounce } from './signature-elimination-client';
import {
  followUpTypeSetterElimination,
  followUpTypeSetterTypedHole,
} from './type-setter-follow-up';

vi.mock('../jump-client', () => ({ postJumpRequest: vi.fn() }));
vi.mock('./signature-elimination-client', () => ({
  eliminateSignaturesAndAnnounce: vi.fn(),
}));

const eliminate = vi.mocked(eliminateSignaturesAndAnnounce);
const typedHole = vi.mocked(postJumpRequest);
const quiet: SignatureEliminationResponse = {
  results: [{ systemId: 1, status: 'quiet' }],
};

beforeEach(() => {
  eliminate.mockReset().mockResolvedValue(quiet);
  typedHole.mockReset().mockResolvedValue({
    status: 'processed', outcome: 'typed-hole', emitted: false,
  });
});

describe('type setter follow-up recovery', () => {
  it.each(['idle', undefined] as const)('skips an initial %s write', async (kind) => {
    const input = {
      mapId: 'initial', connectionId: 'c1', systemId: 1,
      write: kind === undefined ? undefined : { kind },
    };
    await followUpTypeSetterElimination(input);
    await followUpTypeSetterTypedHole(input);
    expect(eliminate).not.toHaveBeenCalled();
    expect(typedHole).not.toHaveBeenCalled();
  });

  it('runs both stages for a mutated write then skips idle', async () => {
    const input = { mapId: 'mutated', connectionId: 'c1', systemId: 1 };
    await followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledExactlyOnceWith({ mapId: 'mutated', systemIds: [1] });
    expect(typedHole).toHaveBeenCalledExactlyOnceWith({
      kind: 'typed-hole', mapId: 'mutated', connectionId: 'c1',
    });
  });

  it.each<SignatureEliminationResponse | null>([
    null,
    { results: [{ systemId: 2, status: 'quiet' }] },
  ])('retries an unfinished elimination independently of typed-hole: %j', async (outcome) => {
    const input = { mapId: 'elimination-retry', connectionId: 'c1', systemId: 1 };
    eliminate.mockResolvedValueOnce(outcome);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(2);
    expect(typedHole).toHaveBeenCalledTimes(1);
  });

  it.each([null, { status: 'retry', reason: 'emission failed' }] as const)(
    'retries an unfinished typed-hole independently of elimination: %j', async (outcome) => {
      const input = { mapId: 'typed-hole-retry', connectionId: 'c1', systemId: 1 };
      typedHole.mockResolvedValueOnce(outcome);
      await followUpTypeSetterElimination({ ...input, write: { kind: 'claimed' } });
      await followUpTypeSetterTypedHole({ ...input, write: { kind: 'claimed' } });
      await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
      await followUpTypeSetterTypedHole({ ...input, write: { kind: 'idle' } });
      await followUpTypeSetterTypedHole({ ...input, write: { kind: 'idle' } });
      expect(eliminate).toHaveBeenCalledTimes(1);
      expect(typedHole).toHaveBeenCalledTimes(2);
    },
  );

  it('retains a failed attempt across a rejected mutation without issuing a follow-up', async () => {
    const input = { mapId: 'mutation-rejected', connectionId: 'c1', systemId: 1 };
    eliminate.mockResolvedValueOnce(null);
    typedHole.mockResolvedValueOnce(null);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterElimination({ ...input, write: undefined });
    await followUpTypeSetterTypedHole({ ...input, write: undefined });
    expect(eliminate).toHaveBeenCalledTimes(1);
    expect(typedHole).toHaveBeenCalledTimes(1);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterTypedHole({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(2);
    expect(typedHole).toHaveBeenCalledTimes(2);
  });

  it('keeps a thrown follow-up retryable', async () => {
    const input = { mapId: 'throw', connectionId: 'c1', systemId: 1 };
    eliminate.mockRejectedValueOnce(new Error('failed'));
    await expect(followUpTypeSetterElimination({
      ...input, write: { kind: 'mutated' },
    })).rejects.toThrow('failed');
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(2);
  });

  it('keeps retry state scoped to the map, connection, and typed system', async () => {
    const input = { mapId: 'scope', connectionId: 'c1', systemId: 1 };
    eliminate.mockResolvedValueOnce(null);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    for (const other of [{ mapId: 'other' }, { connectionId: 'c2' }, { systemId: 2 }]) {
      await followUpTypeSetterElimination({ ...input, ...other, write: { kind: 'idle' } });
    }
    expect(eliminate).toHaveBeenCalledTimes(1);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(2);
  });

  it('does not let an older success clear a newer failed attempt', async () => {
    const input = { mapId: 'overlap', connectionId: 'c1', systemId: 1 };
    const older = Promise.withResolvers<SignatureEliminationResponse | null>();
    eliminate.mockReturnValueOnce(older.promise).mockResolvedValueOnce(null);
    const first = followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    older.resolve(quiet);
    await first;
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(3);
  });

  it.each([quiet, null])('waits for an in-flight attempt before deciding whether idle needs retry: %j', async (outcome) => {
    const input = { mapId: 'in-flight', connectionId: 'c1', systemId: 1 };
    const pending = Promise.withResolvers<SignatureEliminationResponse | null>();
    eliminate.mockReturnValueOnce(pending.promise);
    const first = followUpTypeSetterElimination({ ...input, write: { kind: 'mutated' } });
    const idle = followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(1);
    pending.resolve(outcome);
    await Promise.all([first, idle]);
    expect(eliminate).toHaveBeenCalledTimes(outcome === null ? 2 : 1);
    await followUpTypeSetterElimination({ ...input, write: { kind: 'idle' } });
    expect(eliminate).toHaveBeenCalledTimes(outcome === null ? 2 : 1);
  });
});
