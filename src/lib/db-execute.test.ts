import { sql } from 'drizzle-orm';
import { expect, test, vi } from 'vitest';
import { executeRows } from './db-execute';
import type { AnyPgDb } from './db-types';

function databaseResolving(result: unknown) {
  const execute = vi.fn().mockResolvedValue(result);
  return { database: { execute } as unknown as AnyPgDb, execute };
}

test('executeRows reads the rows from either driver result shape', async () => {
  const query = sql`SELECT 1 AS "one"`;

  const rowList = Object.assign([{ one: 1 }], { count: 1, command: 'SELECT' });
  const postgresJs = databaseResolving(rowList);
  await expect(executeRows<{ one: number }>(postgresJs.database, query)).resolves.toBe(rowList);
  expect(postgresJs.execute).toHaveBeenCalledExactlyOnceWith(query);

  const neonHttp = databaseResolving({ rows: [{ one: 1 }, { one: 2 }], rowCount: 2, command: 'SELECT', fields: [] });
  await expect(executeRows<{ one: number }>(neonHttp.database, query)).resolves.toEqual([{ one: 1 }, { one: 2 }]);

  await expect(executeRows(databaseResolving({ rows: [], rowCount: 0 }).database, query)).resolves.toEqual([]);
});
