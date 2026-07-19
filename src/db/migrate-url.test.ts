import { describe, expect, it } from 'vitest';
import { resolveMigrationUrl } from './migrate-url';

const OWNER = 'postgres://owner@host/db';
const RUNTIME = 'postgres://runtime@host/db';

describe('resolveMigrationUrl', () => {
  it('prefers DATABASE_MIGRATION_URL when set', () => {
    expect(
      resolveMigrationUrl({ DATABASE_MIGRATION_URL: OWNER, DATABASE_URL: RUNTIME }),
    ).toBe(OWNER);
  });

  it('falls back to DATABASE_URL when the migration URL is unset', () => {
    expect(resolveMigrationUrl({ DATABASE_URL: RUNTIME })).toBe(RUNTIME);
  });

  it('treats an empty or whitespace migration URL as missing', () => {
    expect(
      resolveMigrationUrl({ DATABASE_MIGRATION_URL: '', DATABASE_URL: RUNTIME }),
    ).toBe(RUNTIME);
    expect(
      resolveMigrationUrl({ DATABASE_MIGRATION_URL: '   ', DATABASE_URL: RUNTIME }),
    ).toBe(RUNTIME);
  });

  it('throws when neither variable carries a value', () => {
    expect(() => resolveMigrationUrl({})).toThrow(/migration connection string/);
    expect(() =>
      resolveMigrationUrl({ DATABASE_MIGRATION_URL: '', DATABASE_URL: '  ' }),
    ).toThrow(/migration connection string/);
  });
});
