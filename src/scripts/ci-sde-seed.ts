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
import { runIngest } from '../data/eve-data/ingest';
import { getSdeMetaValue, setSdeMetaValue } from '../data/eve-data/meta';
import { getRemoteSdeVersion } from '../data/eve-data/source';
import type { PostgresJsDb } from '@/lib/db-types';
import { runScript } from './script-runtime';
import { hasCompleteSdeData } from './sde-bootstrap';
import {
  SDE_SEED_SOURCE_FILES,
  type DockerPgCommand,
  type SdeSeedAction,
  type SdeSeedPgTarget,
  buildSdeDumpDockerCommand,
  buildSdeRestoreDockerCommand,
  hashSdeSeedSources,
  parseSdeSeedArgs,
  parseSdeSeedPgTarget,
  resolveSdeSeedAction,
  sdeSeedAnalyzeSql,
  sdeSeedDumpFileName,
  sdeSeedDumpPath,
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

async function readSentinelCounts(db: PostgresJsDb): Promise<{
  typeDogma: number;
  npcStations: number;
  systemJumps: number;
}> {
  const [countsRow] = await db.execute<{
    rowCount: string;
    universeRowCount: string;
    jumpsRowCount: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM type_dogma)::text AS "rowCount",
      (SELECT COUNT(*) FROM eve_npc_stations)::text AS "universeRowCount",
      (SELECT COUNT(*) FROM eve_system_jumps)::text AS "jumpsRowCount"
  `);
  if (!countsRow) throw new Error('SDE sentinel count query returned no row');
  return {
    typeDogma: Number(countsRow.rowCount),
    npcStations: Number(countsRow.universeRowCount),
    systemJumps: Number(countsRow.jumpsRowCount),
  };
}

async function seedLooksComplete(
  db: PostgresJsDb,
  expectedVersion: string | null,
): Promise<boolean> {
  const counts = await readSentinelCounts(db);
  if (!hasCompleteSdeData(counts)) return false;
  if (expectedVersion === null) return true;
  const stored = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  return stored === expectedVersion;
}

async function ingestFromCcp(
  db: PostgresJsDb,
  remoteVersion: string | null,
): Promise<string> {
  const summary = await runIngest(db);
  const version = remoteVersion ?? (await getRemoteSdeVersion());
  if (!version) {
    throw new Error(
      'SDE ingest succeeded but the CCP version manifest did not return a build number.',
    );
  }
  await setSdeMetaValue(db, SDE_META_KEY_VERSION, version);
  console.log('SDE ingest complete.');
  console.log(JSON.stringify({ ...summary, sdeVersion: version }, null, 2));
  return version;
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
  } catch (err) {
    console.warn('SDE seed restore failed; ingesting from CCP:', err);
    const version = await ingestFromCcp(db, remoteVersion);
    await writeDump(cacheDir, version, sourceHash, target);
    return;
  }
  if (await seedLooksComplete(db, remoteVersion)) {
    console.log(`SDE seed restored (${dumpFileName}).`);
    return;
  }
  console.warn('SDE seed restore was incomplete; ingesting from CCP.');
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
  const args = parseSdeSeedArgs(process.argv.slice(2), readEnv('SDE_SEED_CACHE_DIR'));
  const sourceHash = hashSdeSeedSources(await readSeedSourceContents());
  const remoteVersion = await getRemoteSdeVersion();
  const dumpPath =
    args.cacheDir && remoteVersion
      ? sdeSeedDumpPath(args.cacheDir, remoteVersion, sourceHash)
      : null;
  const action: SdeSeedAction = resolveSdeSeedAction({
    cacheDir: args.cacheDir,
    remoteVersion,
    dumpExists: dumpPath ? existsSync(dumpPath) : false,
    forceIngest: args.forceIngest,
  });
  const db = drizzle(client);
  const target = parseSdeSeedPgTarget(databaseUrl);

  switch (action) {
    case 'restore':
      if (!args.cacheDir || !remoteVersion) {
        throw new Error('SDE restore plan is missing a cache directory or remote version');
      }
      await restoreOrIngest(db, args.cacheDir, remoteVersion, sourceHash, target);
      return;
    case 'ingest':
      await ingestAndMaybeDump(db, args.cacheDir, remoteVersion, sourceHash, target);
      return;
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled SDE seed action: ${String(exhaustive)}`);
    }
  }
}

runScript(main, { client });
