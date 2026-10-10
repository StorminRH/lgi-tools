import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { makeBatchInserter, readJsonl, streamJsonl } from './sde-io';

async function withJsonlFile(body: string, run: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'lgi-sde-io-'));
  try {
    const path = join(dir, 'rows.jsonl');
    await writeFile(path, body);
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('reads JSONL records in file order, skipping blank and whitespace-only lines across CRLF endings', async () => {
  await withJsonlFile(
    '\n{"_key": 1, "name": "Tritanium"}\r\n   \r\n{"_key": 2, "name": "Pyerite"}\n\n  {"_key": 3, "name": "Mexallon"}  \n',
    async (path) => {
      const streamed: Record<string, unknown>[] = [];
      for await (const row of streamJsonl(path)) streamed.push(row);
      expect(streamed).toEqual([
        { _key: 1, name: 'Tritanium' },
        { _key: 2, name: 'Pyerite' },
        { _key: 3, name: 'Mexallon' },
      ]);

      await expect(readJsonl(path)).resolves.toEqual(streamed);
      await expect(readJsonl(path, (row) => row._key !== 2)).resolves.toEqual([
        { _key: 1, name: 'Tritanium' },
        { _key: 3, name: 'Mexallon' },
      ]);
    },
  );
});

test('streams lazily: a record is yielded before a later malformed line is parsed', async () => {
  await withJsonlFile('{"_key": 1}\nnot json\n{"_key": 3}\n', async (path) => {
    const records = streamJsonl(path);
    await expect(records.next()).resolves.toEqual({ done: false, value: { _key: 1 } });
    await expect(records.next()).rejects.toBeInstanceOf(SyntaxError);
    await expect(readJsonl(path)).rejects.toBeInstanceOf(SyntaxError);
  });
});

test('batch inserter flushes every batchSize rows and the remainder on flush(), each batch a fresh array', async () => {
  const batches: number[][] = [];
  const inserter = makeBatchInserter<number>(2, async (batch) => {
    batches.push(batch);
  });
  await inserter.add([1, 2, 3]);
  expect(batches).toEqual([[1, 2]]);
  expect(inserter.written()).toBe(2);
  await inserter.add([4]);
  expect(batches).toEqual([[1, 2], [3, 4]]);
  await inserter.flush();
  expect(batches).toEqual([[1, 2], [3, 4]]);
  await inserter.add([5]);
  await inserter.flush();
  expect(batches).toEqual([[1, 2], [3, 4], [5]]);
  expect(inserter.written()).toBe(5);
});

test('batch inserter never calls the sink when nothing was added', async () => {
  let calls = 0;
  const inserter = makeBatchInserter<number>(2, async () => {
    calls++;
  });
  await inserter.flush();
  expect(calls).toBe(0);
  expect(inserter.written()).toBe(0);
});
