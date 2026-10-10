import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from './console-tags';

const realError = console.error;
let forwarded: unknown[][];

beforeEach(() => {
  forwarded = [];
  console.error = (...args: unknown[]) => {
    forwarded.push(args);
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  console.error = realError;
});

describe('silenceConsolePrefixes', () => {
  it('swallows a call whose first argument starts with a string prefix', () => {
    const cause = new Error('usage_logs locked');
    const spy = silenceConsolePrefixes('error', ['[housekeeping]']);

    console.error('[housekeeping] usage_logs failed', cause);

    expect(forwarded).toEqual([]);
    expect(spy).toHaveBeenCalledExactlyOnceWith('[housekeeping] usage_logs failed', cause);
  });

  it('swallows a call whose first argument matches a RegExp', () => {
    const spy = silenceConsolePrefixes('error', [/^\[cron:\w+\] batch step failed$/]);

    console.error('[cron:prices] batch step failed');

    expect(forwarded).toEqual([]);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('forwards a non-matching or non-string first argument to the original method', () => {
    const cause = new Error('boom');
    const spy = silenceConsolePrefixes('error', ['[housekeeping]', /^\{"scope":"cron:/]);

    console.error('[other] failed', cause);
    console.error('failed in [housekeeping]');
    console.error('{"scope":"location:sync"}');
    console.error(cause);
    console.error();

    const calls = [['[other] failed', cause], ['failed in [housekeeping]'], ['{"scope":"location:sync"}'], [cause], []];
    expect(forwarded).toEqual(calls);
    expect(spy.mock.calls).toEqual(calls);
  });

  it('records swallowed and forwarded calls on the returned spy', () => {
    const spy = silenceConsolePrefixes('error', ['[expected]']);

    console.error('[expected] quiet');
    console.error('[unexpected] loud');

    expect(forwarded).toEqual([['[unexpected] loud']]);
    expect(spy.mock.calls).toEqual([['[expected] quiet'], ['[unexpected] loud']]);
  });

  it('puts the original method back when the spy is restored', () => {
    const spy = silenceConsolePrefixes('error', ['[expected]']);

    spy.mockRestore();
    console.error('[expected] after restore');

    expect(vi.isMockFunction(console.error)).toBe(false);
    expect(forwarded).toEqual([['[expected] after restore']]);
  });

  it('refuses to wrap a console method that is already mocked', () => {
    silenceConsolePrefixes('error', ['[expected]']);

    expect(() => silenceConsolePrefixes('error', ['[other]'])).toThrow(
      'console.error is already mocked; restore it before silencing prefixes',
    );
    console.error('[other] still forwarded');
    expect(forwarded).toEqual([['[other] still forwarded']]);
  });
});
