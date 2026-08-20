// Depot verify seed: restore a versioned SDE dump from the cache disk, or
// ingest from CCP and write that dump. Production ingest / cron / vercel-build
// stay on ingest-sde and the pipeline entries.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readEnv, requireEnv } from '@/lib/env';
import { PG_CONNECT_TIMEOUT_SECONDS } from '@/db';
import { SDE_META_KEY_VERSION } from '../data/eve-data/constants';
import { getSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import type { PostgresJsDb } from '@/lib/db-types';
import { runScript } from './script-runtime';
import { hasCompleteSdeData } from './sde-bootstrap';
import { ingestAndStampSdeVersion, readSdeSentinelCounts } from './sde-ingest-io';
import {
  SDE_SEED_SOURCE_FILES,
  type DockerPgCommand,
  type SdeSeedPgTarget,
  buildSdeDumpDockerCommand,
  buildSdeRestoreDockerCommand,
  parseSdeSeedPgTarget,
  prepareSdeSeedRun,
  sdeSeedAnalyzeSql,
  sdeSeedDumpFileName,
} from './sde-seed-cache';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

const execFileAsync = promisify(execFile);
const databaseUrl = requireEnv('DATABASE_URL');
const client = postgres(databaseUrl, {
  max: 1,
  connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
});

async function readSeedSourceContents(): Promise<Record<string, string>> {
  const entries = await Promise.all(
    SDE_SEED_SOURCE_FILES.map(async (path) => {
      const body = await readFile(path, 'utf8');
      return [path, body] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function runDockerPg(command: DockerPgCommand): Promise<void> {
  await execFileAsync(command.file, command.args, {
    env: { ...process.env, ...command.env },
  });
}

async function seedLooksComplete(
  db: PostgresJsDb,
  expectedVersion: string | null,
): Promise<boolean> {
  const counts = await readSdeSentinelCounts(db);
  if (!hasCompleteSdeData(counts)) return false;
  if (expectedVersion === null) return true;
  const stored = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  return stored === expectedVersion;
}

async function ingestFromCcp(
  db: PostgresJsDb,
  remoteVersion: string | null,
): Promise<string> {
  const { summary, sdeVersion } = await ingestAndStampSdeVersion(db, { remoteVersion });
  console.log('SDE ingest complete.');
  console.log(JSON.stringify({ ...summary, sdeVersion }, null, 2));
  return sdeVersion;
}

async function writeDump(
  cacheDir: string,
  version: string,
  sourceHash: string,
  target: SdeSeedPgTarget,
): Promise<void> {
  const fileName = sdeSeedDumpFileName(version, sourceHash);
  const tmpName = `${fileName}.tmp`;
  const finalPath = join(cacheDir, fileName);
  const tmpHostPath = join(cacheDir, tmpName);
  await unlink(tmpHostPath).catch(() => undefined);
  try {
    await runDockerPg(buildSdeDumpDockerCommand(cacheDir, tmpName, target));
    await rename(tmpHostPath, finalPath);
    console.log(`SDE seed dump written (${fileName}).`);
  } catch (err) {
    await unlink(tmpHostPath).catch(() => undefined);
    console.warn('SDE seed dump skipped (sidecar is populated):', err);
  }
}

async function restoreDump(
  cacheDir: string,
  dumpFileName: string,
  target: SdeSeedPgTarget,
  db: PostgresJsDb,
): Promise<void> {
  await runDockerPg(buildSdeRestoreDockerCommand(cacheDir, dumpFileName, target));
  await db.execute(sql.raw(sdeSeedAnalyzeSql()));
}

async function restoreOrIngest(
  db: PostgresJsDb,
  cacheDir: string,
  remoteVersion: string,
  sourceHash: string,
  target: SdeSeedPgTarget,
): Promise<void> {
  const dumpFileName = sdeSeedDumpFileName(remoteVersion, sourceHash);
  try {
    await restoreDump(cacheDir, dumpFileName, target, db);
    if (await seedLooksComplete(db, remoteVersion)) {
      console.log(`SDE seed restored (${dumpFileName}).`);
      return;
    }
    console.warn('SDE seed restore was incomplete; ingesting from CCP.');
  } catch (err) {
    console.warn('SDE seed restore failed; ingesting from CCP:', err);
  }
  const version = await ingestFromCcp(db, remoteVersion);
  await writeDump(cacheDir, version, sourceHash, target);
}

async function ingestAndMaybeDump(
  db: PostgresJsDb,
  cacheDir: string | null,
  remoteVersion: string | null,
  sourceHash: string,
  target: SdeSeedPgTarget,
): Promise<void> {
  const version = await ingestFromCcp(db, remoteVersion);
  if (cacheDir) await writeDump(cacheDir, version, sourceHash, target);
}

async function main(): Promise<void> {
  const prepared = prepareSdeSeedRun({
    argv: process.argv.slice(2),
    cacheDirEnv: readEnv('SDE_SEED_CACHE_DIR'),
    sourceContents: await readSeedSourceContents(),
    remoteVersion: await getRemoteSdeVersion(),
    dumpExists: existsSync,
  });
  const db = drizzle(client);
  const target = parseSdeSeedPgTarget(databaseUrl);
  switch (prepared.action) {
    case 'restore':
      await restoreOrIngest(
        db,
        prepared.cacheDir,
        prepared.remoteVersion,
        prepared.sourceHash,
        target,
      );
      return;
    case 'ingest':
      await ingestAndMaybeDump(
        db,
        prepared.cacheDir,
        prepared.remoteVersion,
        prepared.sourceHash,
        target,
      );
      return;
    default: {
      const exhaustive: never = prepared;
      throw new Error(`Unhandled SDE seed action: ${String(exhaustive)}`);
    }
  }
}

runScript(main, { client });
