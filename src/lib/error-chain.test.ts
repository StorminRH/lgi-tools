import { DrizzleQueryError } from 'drizzle-orm/errors';
import { expect, test } from 'vitest';
import { isTimeoutError } from './error-chain';

const timeoutAbort = (): DOMException => new DOMException('signal timed out', 'TimeoutError');

// NeonDbError's fetch-failure shape: no cause, the failed fetch on sourceError.
function neonFetchFailure(sourceError: Error): Error {
  const err = new Error(`Error connecting to database: ${sourceError}`);
  err.name = 'NeonDbError';
  return Object.assign(err, { sourceError });
}

function wrappedIn(wrappers: number, inner: unknown): unknown {
  let node = inner;
  for (let i = 0; i < wrappers; i++) node = new Error(`wrapper ${i}`, { cause: node });
  return node;
}

test('isTimeoutError finds a timeout abort at the top level and through cause, sourceError and the Drizzle → Neon wrap', () => {
  expect(isTimeoutError(timeoutAbort())).toBe(true);
  expect(isTimeoutError(Object.assign(new Error('upstream slow'), { name: 'TimeoutError' }))).toBe(true);
  expect(isTimeoutError(new Error('outer', { cause: timeoutAbort() }))).toBe(true);
  expect(isTimeoutError(neonFetchFailure(timeoutAbort()))).toBe(true);
  expect(
    isTimeoutError(new DrizzleQueryError('select 1', [], neonFetchFailure(timeoutAbort()))),
  ).toBe(true);
});

test('isTimeoutError walks both links, so a timeout beside or behind a non-timeout branch is still found', () => {
  const beside = Object.assign(new Error('outer'), {
    cause: new TypeError('some other detail'),
    sourceError: timeoutAbort(),
  });
  const behindCause = Object.assign(new Error('outer'), {
    cause: neonFetchFailure(timeoutAbort()),
    sourceError: new TypeError('some other detail'),
  });

  expect(isTimeoutError(beside)).toBe(true);
  expect(isTimeoutError(behindCause)).toBe(true);
});

test('isTimeoutError rejects aborts, fetch failures, timeout wording in a message, and non-object input', () => {
  expect(isTimeoutError(new DOMException('This operation was aborted', 'AbortError'))).toBe(false);
  expect(
    isTimeoutError(new DrizzleQueryError('select 1', [], neonFetchFailure(new TypeError('fetch failed')))),
  ).toBe(false);
  expect(isTimeoutError(new Error('TimeoutError: signal timed out'))).toBe(false);
  expect(isTimeoutError(null)).toBe(false);
  expect(isTimeoutError(undefined)).toBe(false);
  expect(isTimeoutError('TimeoutError')).toBe(false);
  expect(isTimeoutError(504)).toBe(false);
});

test('isTimeoutError visits at most 16 nodes, so a cycle ends and a timeout past the bound is missed', () => {
  const a = new Error('a');
  const b = new Error('b');
  Object.assign(a, { cause: b, sourceError: b });
  Object.assign(b, { cause: a, sourceError: a });

  expect(isTimeoutError(a)).toBe(false);
  expect(isTimeoutError(wrappedIn(15, timeoutAbort()))).toBe(true);
  expect(isTimeoutError(wrappedIn(16, timeoutAbort()))).toBe(false);
});
