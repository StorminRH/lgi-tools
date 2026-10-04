import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';
import type { AnyPgDb } from '@/lib/db-types';

const INSERT_BATCH = 1000;

/** Every record of a JSONL file, or only those `keep` accepts, so a large file never sits whole in memory. */
export async function readJsonl(
  path: string,
  keep: (row: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const rl = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const row = JSON.parse(trimmed) as Record<string, unknown>;
    if (keep(row)) out.push(row);
  }
  return out;
}

export async function insertChunked<T extends Record<string, unknown>>(
  tx: AnyPgDb,
  table: PgTable,
  rows: T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await tx.insert(table).values(rows.slice(i, i + INSERT_BATCH) as PgInsertValue<PgTable>[]);
  }
}
