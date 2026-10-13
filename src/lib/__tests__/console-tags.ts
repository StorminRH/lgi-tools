import { vi } from 'vitest';

/**
 * Silences only the console lines a test expects. A call whose first argument
 * is a string that starts with one of the string prefixes, or matches one of
 * the RegExps, is swallowed. Every other call still reaches the real console,
 * so an unexpected log shows up in the run instead of vanishing.
 *
 * The returned spy records every call, swallowed or forwarded, so a test can
 * still assert the lines that are part of its contract. Nothing restores it
 * automatically: restore it through the spy or `vi.restoreAllMocks()`.
 */
export function silenceConsolePrefixes(
  level: 'log' | 'info' | 'warn' | 'error' | 'debug',
  prefixes: readonly (string | RegExp)[],
) {
  const original = console[level];
  if (vi.isMockFunction(original)) {
    throw new Error(`console.${level} is already mocked; restore it before silencing prefixes`);
  }
  return vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
    if (!isExpected(args[0], prefixes)) original.apply(console, args);
  });
}

function isExpected(first: unknown, prefixes: readonly (string | RegExp)[]): boolean {
  if (typeof first !== 'string') return false;
  return prefixes.some((prefix) =>
    typeof prefix === 'string' ? first.startsWith(prefix) : prefix.test(first),
  );
}
