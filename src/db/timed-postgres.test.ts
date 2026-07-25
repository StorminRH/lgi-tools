import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addDependencyTiming,
  setDependencyTimingSink,
  type DependencyKind,
} from '@/lib/dependency-timing';
import { withQueryTiming } from './timed-postgres';

// A minimal stand-in for postgres-js's `Query`: a lazy thenable that only runs
// when the caller first calls `then`, guards re-execution, and returns a plain
// promise from `then` (postgres-js does the same via `Symbol.species`).
class FakeQuery implements PromiseLike<unknown> {
  executed = 0;
  private settled?: Promise<unknown>;
  constructor(private readonly settle: () => Promise<unknown>) {}
  then<A, B>(
    onOk?: ((value: unknown) => A | PromiseLike<A>) | null,
    onErr?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    // Runs the statement at most once, the way postgres-js's own `executed`
    // flag does; the production safety argument rests on that guard, so the
    // double has to model it rather than merely count calls.
    if (this.settled === undefined) {
      this.executed += 1;
      this.settled = this.settle();
    }
    return this.settled.then(onOk, onErr);
  }
  values(): this {
    return this;
  }
}

function fakeClient() {
  const client = function tagged(): FakeQuery {
    return new FakeQuery(async () => 'tagged');
  } as unknown as Record<string, unknown> & (() => FakeQuery);

  client.unsafe = (): FakeQuery => new FakeQuery(async () => 'unsafe');
  client.failing = (): FakeQuery =>
    new FakeQuery(async () => {
      throw new Error('boom');
    });
  client.reserve = async (): Promise<object> => {
    const reserved = function reservedTagged(): FakeQuery {
      return new FakeQuery(async () => 'reserved');
    } as unknown as Record<string, unknown> & (() => FakeQuery);
    reserved.release = (): string => 'released';
    return reserved;
  };
  client.begin = (fn: (handle: object) => Promise<unknown>): Promise<unknown> =>
    fn(client);
  client.notAFunction = 42;
  return client;
}

let recorded: Array<[DependencyKind, number]>;

beforeEach(() => {
  recorded = [];
  setDependencyTimingSink((kind, ms) => {
    recorded.push([kind, ms]);
  });
});

afterEach(() => {
  setDependencyTimingSink(() => {});
});

describe('withQueryTiming', () => {
  it('times a tagged-template statement once against neon', async () => {
    const sql = withQueryTiming(fakeClient());
    await expect(sql()).resolves.toBe('tagged');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.[0]).toBe('neon');
    expect(recorded[0]?.[1]).toBeGreaterThanOrEqual(0);
  });

  it('times drizzle-style unsafe() calls and preserves chained builders', async () => {
    const sql = withQueryTiming(fakeClient());
    const query = (sql as unknown as { unsafe: () => FakeQuery }).unsafe();
    await expect(query.values()).resolves.toBe('unsafe');
    expect(recorded.map(([kind]) => kind)).toEqual(['neon']);
  });

  it('records a rejected statement and still rejects for the caller', async () => {
    const sql = withQueryTiming(fakeClient());
    await expect(
      (sql as unknown as { failing: () => FakeQuery }).failing(),
    ).rejects.toThrow('boom');
    expect(recorded.map(([kind]) => kind)).toEqual(['neon']);
  });

  it('does not execute a statement the caller never awaits', () => {
    const sql = withQueryTiming(fakeClient());
    const query = (sql as unknown as { unsafe: () => FakeQuery }).unsafe();
    expect(query.executed).toBe(0);
    expect(recorded).toEqual([]);
  });

  it('counts one settlement per statement even when awaited twice', async () => {
    const sql = withQueryTiming(fakeClient());
    const query = (sql as unknown as { unsafe: () => FakeQuery }).unsafe();
    await query;
    await query;
    expect(recorded).toHaveLength(1);
  });

  it('times reserve() and keeps timing statements on the reserved connection', async () => {
    const sql = withQueryTiming(fakeClient());
    const reserved = await (
      sql as unknown as { reserve: () => Promise<(() => FakeQuery) & { release: () => string }> }
    ).reserve();

    expect(recorded.map(([kind]) => kind)).toEqual(['neon']);
    await expect(reserved()).resolves.toBe('reserved');
    expect(recorded.map(([kind]) => kind)).toEqual(['neon', 'neon']);
    expect(reserved.release()).toBe('released');
    expect(recorded).toHaveLength(2);
  });

  it('times statements inside a transaction without counting the envelope', async () => {
    const sql = withQueryTiming(fakeClient());
    await (
      sql as unknown as { begin: (fn: (handle: () => FakeQuery) => Promise<unknown>) => Promise<unknown> }
    ).begin(async (handle) => {
      await handle();
      await handle();
    });
    expect(recorded).toHaveLength(2);
  });

  it('passes non-function properties through untouched', () => {
    const sql = withQueryTiming(fakeClient());
    expect((sql as unknown as { notAFunction: number }).notAFunction).toBe(42);
  });

  it('records nothing when no sink is listening', async () => {
    setDependencyTimingSink(() => {});
    const sql = withQueryTiming(fakeClient());
    await sql();
    expect(recorded).toEqual([]);
    // The hook itself stays callable with no listener installed.
    expect(() => addDependencyTiming('neon', 1)).not.toThrow();
  });
});

describe('lifecycle methods', () => {
  it('does not count connection lifecycle calls as query cost', async () => {
    const client = fakeClient();
    (client as unknown as Record<string, unknown>).end = async (): Promise<string> => 'ended';
    const sql = withQueryTiming(client);

    await expect(
      (sql as unknown as { end: () => Promise<string> }).end(),
    ).resolves.toBe('ended');

    // `end()` drains the pool; counting it would dominate a run's p95.
    expect(recorded).toEqual([]);
  });
});
