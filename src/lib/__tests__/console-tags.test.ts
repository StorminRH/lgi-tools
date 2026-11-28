import { expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from './console-tags';

function captureConsoleError() {
  const realError = console.error;
  const forwarded: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };
  return {
    forwarded,
    [Symbol.dispose]: () => {
      vi.restoreAllMocks();
      console.error = realError;
    },
  };
}

test('swallows calls whose first argument matches a string prefix or RegExp, forwards the rest, and records both on the spy', () => {
  using capture = captureConsoleError();
  const cause = new Error('boom');
  const spy = silenceConsolePrefixes('error', ['[housekeeping]', /^\[cron:\w+\] batch step failed$/]);

  console.error('[housekeeping] usage_logs failed', cause);
  console.error('[cron:prices] batch step failed');
  console.error('[other] failed', cause);
  console.error('failed in [housekeeping]');
  console.error('[cron:prices] batch step failed later');
  console.error(cause);
  console.error();

  const loud = [['[other] failed', cause], ['failed in [housekeeping]'], ['[cron:prices] batch step failed later'], [cause], []];
  expect(capture.forwarded).toEqual(loud);
  expect(spy.mock.calls).toEqual([
    ['[housekeeping] usage_logs failed', cause],
    ['[cron:prices] batch step failed'],
    ...loud,
  ]);
});

test('puts the original method back when the spy is restored', () => {
  using capture = captureConsoleError();
  const spy = silenceConsolePrefixes('error', ['[expected]']);

  spy.mockRestore();
  console.error('[expected] after restore');

  expect(vi.isMockFunction(console.error)).toBe(false);
  expect(capture.forwarded).toEqual([['[expected] after restore']]);
});

test('refuses to wrap a console method that is already mocked', () => {
  using capture = captureConsoleError();
  silenceConsolePrefixes('error', ['[expected]']);

  expect(() => silenceConsolePrefixes('error', ['[other]'])).toThrow(
    'console.error is already mocked; restore it before silencing prefixes',
  );
  console.error('[other] still forwarded');
  expect(capture.forwarded).toEqual([['[other] still forwarded']]);
});
