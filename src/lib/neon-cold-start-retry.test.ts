import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureNeonColdStartMetricSink,
  isNeonColdStartError,
  withColdStartRetry,
} from './neon-cold-start-retry';

type ErrorExtras = { code?: string; cause?: unknown; sourceError?: unknown };

function neonError(message: string, extras: ErrorExtras = {}): Error {
  const err = new Error(message);
  err.name = 'NeonDbError';
  return Object.assign(err, extras);
}

// The shape drizzle-orm wraps every query error in (`Failed query: ...` with
// the driver error on `cause`).
function drizzleWrapped(cause: Error): Error {
  return Object.assign(new Error('Failed query: select 1\nparams: '), { cause });
}

const COLD_START = 'Error connecting to database: TypeError: fetch failed';

describe('isNeonColdStartError', () => {
  it.each([
    ['connection message', neonError(COLD_START)],
    ['proxy 5xx message', neonError('Server error (HTTP status 530): <html>')],
    ['SQLSTATE 08006', neonError('Connection terminated', { code: '08006' })],
    ['SQLSTATE 57P03', neonError('the database system is starting up', { code: '57P03' })],
    ['drizzle-wrapped via cause', drizzleWrapped(neonError(COLD_START))],
    ['nested via sourceError', neonError('outer', { sourceError: neonError(COLD_START) })],
  ])('matches %s', (_label, err) => {
    expect(isNeonColdStartError(err)).toBe(true);
  });

  it.each([
    ['proxy 4xx message', neonError('Server error (HTTP status 400): bad request')],
    ['SQL error code', neonError('relation "x" does not exist', { code: '42P01' })],
    ['unique violation', neonError('duplicate key', { code: '23505' })],
    ['bare fetch TypeError', new TypeError('fetch failed')],
    ['plain error', new Error(COLD_START)], // right message, wrong name
    ['non-error', 'fetch failed'],
  ])('rejects %s', (_label, err) => {
    expect(isNeonColdStartError(err)).toBe(false);
  });

  it('survives a cyclic cause chain', () => {
    const a = new Error('a');
    const b = Object.assign(new Error('b'), { cause: a });
    Object.assign(a, { cause: b });
    expect(isNeonColdStartError(a)).toBe(false);
  });
});

describe('withColdStartRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    configureNeonColdStartMetricSink(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes a first-attempt success through untouched', async () => {
    const read = vi.fn().mockResolvedValue('rows');
    await expect(withColdStartRetry(read)).resolves.toBe('rows');
    expect(read).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('retries a transient failure and succeeds', async () => {
    const sink = vi.fn();
    configureNeonColdStartMetricSink(sink);
    const read = vi
      .fn()
      .mockRejectedValueOnce(drizzleWrapped(neonError(COLD_START)))
      .mockResolvedValue('rows');
    const result = withColdStartRetry(read);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe('rows');
    expect(read).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith({ outcome: 'recovered', attempts: 2, totalDelayMs: 500 });
  });

  it('rethrows a non-transient error immediately with one attempt', async () => {
    const sqlError = neonError('relation "x" does not exist', { code: '42P01' });
    const read = vi.fn().mockRejectedValue(sqlError);
    await expect(withColdStartRetry(read)).rejects.toBe(sqlError);
    expect(read).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('exhausts 4 attempts on the designed backoff and rethrows the last error', async () => {
    const sink = vi.fn();
    configureNeonColdStartMetricSink(sink);
    const errors = [1, 2, 3, 4].map((n) => neonError(`${COLD_START} #${n}`));
    let call = 0;
    const read = vi.fn(() => Promise.reject(errors[call++]));
    const result = withColdStartRetry(read);
    const rejection = expect(result).rejects.toBe(errors[3]);

    // Attempt 1 fails immediately; each retry waits 500/1000/2000 ms.
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1999);
    expect(read).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(4);

    await rejection;
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(sink).toHaveBeenCalledWith({ outcome: 'exhausted', attempts: 4, totalDelayMs: 3500 });
  });

  it('isolates a failing telemetry sink from a recovered read', async () => {
    configureNeonColdStartMetricSink(() => {
      throw new Error('telemetry down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const read = vi.fn().mockRejectedValueOnce(neonError(COLD_START)).mockResolvedValue('rows');
    const result = withColdStartRetry(read);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe('rows');
    expect(console.error).toHaveBeenCalledOnce();
  });
});
