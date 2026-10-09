import { expect, test } from 'vitest';
import { assertLocalDatabaseUrl } from './url-safety';

test('rejects a remote database host', () => {
  expect(() => assertLocalDatabaseUrl('postgres://u:p@db.example.com/x', 'codex:seed-guide')).toThrow(
    new Error('codex:seed-guide requires a local Postgres DATABASE_URL'),
  );
});

test('accepts a local host whose host query parameter names a remote server, which postgres.js ignores', () => {
  expect(assertLocalDatabaseUrl('postgres://u:p@localhost/x?host=db.example.com', 'seed')).toBeUndefined();
});

test('rejects the comma multihost form that adds a remote server', () => {
  expect(() => assertLocalDatabaseUrl('postgres://u:p@localhost,db.example.com/x', 'seed')).toThrow(
    new Error('seed requires a local Postgres DATABASE_URL'),
  );
});

test('accepts localhost, 127.0.0.1, and [::1]', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    expect(assertLocalDatabaseUrl(`postgresql://u:p@${host}:5433/x`, 'seed')).toBeUndefined();
  }
});
