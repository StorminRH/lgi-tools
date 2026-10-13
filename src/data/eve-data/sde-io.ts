import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { PgInsertValue, PgTable } from 'drizzle-orm/pg-core';
import { chunk } from '@/lib/array';
import type { AnyPgDb } from '@/lib/db-types';

const INSERT_BATCH = 1000;

/** Each record of a JSONL file in order, read one line at a time so a large file never sits whole in memory; blank lines are skipped. */
export async function* streamJsonl(path: string): AsyncGenerator<Record<string, unknown>> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) yield JSON.parse(trimmed) as Record<string, unknown>;
  }
}

/** Every record of a JSONL file, or only those `keep` accepts, so the rejected rows of a large file are never held. */
export async function readJsonl(
  path: string,
  keep: (row: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const row of streamJsonl(path)) {
    if (keep(row)) out.push(row);
  }
  return out;
}

/**
 * Buffers rows and hands `sink` each full batch of `batchSize`, then the remainder on `flush()`.
 * Every batch is a fresh array, so a sink may keep the one it was given.
 */
export function makeBatchInserter<T>(
  batchSize: number,
  sink: (batch: T[]) => Promise<void>,
) {
  let buffer: T[] = [];
  let written = 0;
  return {
    async add(rows: readonly T[]): Promise<void> {
      for (const row of rows) {
        buffer.push(row);
        if (buffer.length >= batchSize) {
          await sink(buffer);
          written += buffer.length;
          buffer = [];
        }
      }
    },
    async flush(): Promise<void> {
      if (buffer.length > 0) {
        await sink(buffer);
        written += buffer.length;
        buffer = [];
      }
    },
    written(): number {
      return written;
    },
  };
}

export async function insertChunked<T extends Record<string, unknown>>(
  tx: AnyPgDb,
  table: PgTable,
  rows: T[],
): Promise<void> {
  for (const batch of chunk(rows, INSERT_BATCH)) {
    await tx.insert(table).values(batch as PgInsertValue<PgTable>[]);
  }
}
