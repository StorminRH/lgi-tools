import { describe, expect, it, vi } from 'vitest';
import { withAdvisoryLock } from './advisory-lock';

// Reserved-connection stub: a tagged-template fn (the lock/unlock SQL) carrying
// a `.release()`. `got` flips the acquisition; `sqlCalls` records each query so
// the unlock is assertable.
function makeClient(got: boolean, opts: { unlockThrows?: boolean } = {}) {
  const sqlCalls: string[] = [];
  const release = vi.fn();
  const reservedTag = vi.fn((strings: TemplateStringsArray) => {
    const text = strings.join('?');
    sqlCalls.push(text);
    if (text.includes('pg_try_advisory_lock')) return Promise.resolve([{ got }]);
    if (text.includes('pg_advisory_unlock')) {
      if (opts.unlockThrows) return Promise.reject(new Error('unlock failed'));
      return Promise.resolve([{ unlocked: true }]);
    }
    return Promise.resolve([]);
  }) as unknown as { release: typeof release };
  (reservedTag as unknown as { release: typeof release }).release = release;
  const reserve = vi.fn(() => Promise.resolve(reservedTag));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { reserve } as any, sqlCalls, release, reserve };
}

describe('withAdvisoryLock', () => {
  it('reports busy without running the work when the lock is held', async () => {
    const { client, release } = makeClient(false);
    const work = vi.fn();
    const outcome = await withAdvisoryLock(client, 42, work);
    expect(outcome).toEqual({ busy: true });
    expect(work).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('runs the work and returns its result when the lock is acquired', async () => {
    const { client, sqlCalls, release } = makeClient(true);
    const outcome = await withAdvisoryLock(client, 42, async () => 'done');
    expect(outcome).toEqual({ busy: false, result: 'done' });
    // Acquired then released.
    expect(sqlCalls.some((q) => q.includes('pg_try_advisory_lock'))).toBe(true);
    expect(sqlCalls.some((q) => q.includes('pg_advisory_unlock'))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not attempt the unlock when the lock was never held (busy path)', async () => {
    const { client, sqlCalls } = makeClient(false);
    await withAdvisoryLock(client, 42, async () => 'x');
    expect(sqlCalls.some((q) => q.includes('pg_advisory_unlock'))).toBe(false);
  });

  it('releases the connection even if the work throws', async () => {
    const { client, release } = makeClient(true);
    await expect(
      withAdvisoryLock(client, 42, async () => {
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('still releases the connection when the unlock query itself throws', async () => {
    const { client, release } = makeClient(true, { unlockThrows: true });
    await expect(withAdvisoryLock(client, 42, async () => 'ok')).rejects.toThrow('unlock failed');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
