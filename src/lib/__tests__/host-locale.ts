import { vi } from 'vitest';

/**
 * Runs `read` as if the host's default number locale were `locale`, the way a
 * browser in that locale would run it. A bare `toLocaleString()` groups digits
 * for that locale; a call that pins its own locale is unaffected. Server HTML
 * comes from the en-US server, so text that a client component hydrates must
 * read the same here.
 */
export function withHostNumberLocale<T>(locale: string, read: () => T): T {
  const original = Number.prototype.toLocaleString;
  const spy = vi
    .spyOn(Number.prototype, 'toLocaleString')
    .mockImplementation(function (this: number, locales, options) {
      return original.call(this, locales ?? locale, options);
    });
  try {
    return read();
  } finally {
    spy.mockRestore();
  }
}
