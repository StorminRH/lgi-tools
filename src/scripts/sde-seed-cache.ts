import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * Tables `runIngest` + the CI version stamp write. Trees/prices are not
 * required by the Depot verify clone suites and stay empty after migrate.
 */
export const SDE_SEED_TABLES = [
  'eve_categories',
  'eve_groups',
  'eve_types',
  'dgm_attribute_types',
  'type_dogma',
  'industry_blueprints',
  'eve_regions',
  'eve_constellations',
  'eve_solar_systems',
  'eve_station_operations',
  'eve_npc_stations',
  'eve_system_jumps',
  'eve_data_meta',
] as const;

/** Source files whose contents change the rows a seed dump must represent. */
export const SDE_SEED_SOURCE_FILES = [
  'src/data/eve-data/coerce.ts',
  'src/data/eve-data/constants.ts',
  'src/data/eve-data/ingest.ts',
  'src/data/eve-data/meta.ts',
  'src/data/eve-data/schema.ts',
  'src/data/eve-data/source.ts',
  'src/data/eve-data/universe.ts',
] as const;

/** Dump-format token hashed with the table list so a restore key cannot reuse an old layout. */
export const SDE_SEED_DUMP_FORMAT = 'pg-dump-Fc-data-only-v1';

const DUMP_PREFIX = 'sde-';
const DUMP_SUFFIX = '.dump';

/** Closed seed plan: restore a versioned dump, or ingest from CCP. */
export type SdeSeedAction = 'restore' | 'ingest';

/** CLI flags for the CI seed entry. */
export type SdeSeedArgs = {
  cacheDir: string | null;
  forceIngest: boolean;
};

/** Host Postgres target the sidecar publishes; docker talks to 127.0.0.1. */
export type SdeSeedPgTarget = {
  user: string;
  password: string;
  database: string;
  port: string;
};

/** `docker run` invocation; `PGPASSWORD` is forwarded, not placed on argv. */
export type DockerPgCommand = {
  file: string;
  args: string[];
  env: { PGPASSWORD: string };
};

/**
 * Parses `--cache-dir` / `--force`. An env fallback fills cacheDir when the
 * flag is omitted so the workflow can set `SDE_SEED_CACHE_DIR`.
 */
export function parseSdeSeedArgs(
  argv: readonly string[],
  cacheDirEnv?: string,
): SdeSeedArgs {
  let cacheDir: string | null = null;
  let forceIngest = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--force') {
      forceIngest = true;
      continue;
    }
    if (arg === '--cache-dir') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--cache-dir requires a path');
      }
      cacheDir = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (cacheDir === null) {
    const fromEnv = cacheDirEnv?.trim();
    cacheDir = fromEnv && fromEnv.length > 0 ? fromEnv : null;
  }
  return { cacheDir, forceIngest };
}

/** SHA-256 prefix of dump format, table list, and ingest sources. */
export function hashSdeSeedSources(
  contents: Readonly<Record<string, string>>,
  identity: {
    tables: readonly string[];
    format: string;
  } = { tables: SDE_SEED_TABLES, format: SDE_SEED_DUMP_FORMAT },
): string {
  const hash = createHash('sha256');
  hash.update(identity.format);
  hash.update('\n');
  for (const table of identity.tables) {
    hash.update(table);
    hash.update('\n');
  }
  for (const path of SDE_SEED_SOURCE_FILES) {
    const body = contents[path];
    if (body === undefined) {
      throw new Error(`Missing SDE seed source file: ${path}`);
    }
    hash.update(path);
    hash.update('\n');
    hash.update(body);
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, 12);
}

/** Dump file name keyed by CCP build + ingest-source hash. */
export function sdeSeedDumpFileName(version: string, sourceHash: string): string {
  return `${DUMP_PREFIX}${version}-${sourceHash}${DUMP_SUFFIX}`;
}

/** Host path for the versioned dump on the cache disk. */
export function sdeSeedDumpPath(
  cacheDir: string,
  version: string,
  sourceHash: string,
): string {
  return join(cacheDir, sdeSeedDumpFileName(version, sourceHash));
}

/**
 * Restore only when the cache disk has a dump for this CCP build and ingest
 * source. Missing version, missing disk, or `--force` ingest from CCP.
 */
export function resolveSdeSeedAction(input: {
  cacheDir: string | null;
  remoteVersion: string | null;
  dumpExists: boolean;
  forceIngest: boolean;
}): SdeSeedAction {
  if (input.forceIngest) return 'ingest';
  if (input.cacheDir === null) return 'ingest';
  if (input.remoteVersion === null) return 'ingest';
  if (!input.dumpExists) return 'ingest';
  return 'restore';
}

/** Resolved CLI + dump identity the CI entry executes. */
export type PreparedSdeSeed = {
  action: SdeSeedAction;
  cacheDir: string | null;
  remoteVersion: string | null;
  sourceHash: string;
};

/**
 * Builds the seed plan from argv, the CCP manifest, and whether the versioned
 * dump is already on the cache disk.
 */
export function prepareSdeSeedRun(input: {
  argv: readonly string[];
  cacheDirEnv: string | undefined;
  sourceContents: Readonly<Record<string, string>>;
  remoteVersion: string | null;
  dumpExists: (path: string) => boolean;
}): PreparedSdeSeed {
  const args = parseSdeSeedArgs(input.argv, input.cacheDirEnv);
  const sourceHash = hashSdeSeedSources(input.sourceContents);
  const dumpPath =
    args.cacheDir !== null && input.remoteVersion !== null
      ? sdeSeedDumpPath(args.cacheDir, input.remoteVersion, sourceHash)
      : null;
  return {
    action: resolveSdeSeedAction({
      cacheDir: args.cacheDir,
      remoteVersion: input.remoteVersion,
      dumpExists: dumpPath !== null && input.dumpExists(dumpPath),
      forceIngest: args.forceIngest,
    }),
    cacheDir: args.cacheDir,
    remoteVersion: input.remoteVersion,
    sourceHash,
  };
}

/** Narrows a restore plan to the cache path and CCP version the dump is keyed by. */
export function restoreTargetFromPlan(prepared: PreparedSdeSeed): {
  cacheDir: string;
  remoteVersion: string;
} {
  if (prepared.cacheDir === null || prepared.remoteVersion === null) {
    throw new Error('SDE restore plan is missing a cache directory or remote version');
  }
  return { cacheDir: prepared.cacheDir, remoteVersion: prepared.remoteVersion };
}

/**
 * Reads user/password/database/port from a Postgres URL. Host is always the
 * published sidecar on loopback when docker uses `--network host`.
 */
export function parseSdeSeedPgTarget(databaseUrl: string): SdeSeedPgTarget {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '').split('/')[0] ?? '';
  if (!url.username || !database) {
    throw new Error('DATABASE_URL must include a username and database name');
  }
  return {
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    port: url.port || '5432',
  };
}

function dockerPgBaseArgs(
  cacheDir: string,
  target: SdeSeedPgTarget,
  toolArgs: readonly string[],
): string[] {
  return [
    'run',
    '--rm',
    '--network',
    'host',
    '-e',
    'PGPASSWORD',
    '-v',
    `${cacheDir}:/sde-cache`,
    'postgres:16',
    ...toolArgs,
    '-h',
    '127.0.0.1',
    '-p',
    target.port,
    '-U',
    target.user,
    '-d',
    target.database,
  ];
}

function tableFlags(): string[] {
  return SDE_SEED_TABLES.flatMap((table) => ['-t', `public.${table}`]);
}

/** `docker run` that writes a custom-format data-only dump onto the cache disk. */
export function buildSdeDumpDockerCommand(
  cacheDir: string,
  dumpFileName: string,
  target: SdeSeedPgTarget,
): DockerPgCommand {
  return {
    file: 'docker',
    args: [
      ...dockerPgBaseArgs(cacheDir, target, ['pg_dump']),
      '-Fc',
      '--data-only',
      '--no-owner',
      '--no-acl',
      ...tableFlags(),
      '-f',
      `/sde-cache/${dumpFileName}`,
    ],
    env: { PGPASSWORD: target.password },
  };
}

/** `docker run` that restores a data-only dump into the empty migrated sidecar. */
export function buildSdeRestoreDockerCommand(
  cacheDir: string,
  dumpFileName: string,
  target: SdeSeedPgTarget,
): DockerPgCommand {
  return {
    file: 'docker',
    args: [
      ...dockerPgBaseArgs(cacheDir, target, ['pg_restore']),
      '--data-only',
      '--disable-triggers',
      '--no-owner',
      '--no-acl',
      '-j',
      '4',
      `/sde-cache/${dumpFileName}`,
    ],
    env: { PGPASSWORD: target.password },
  };
}

/** `ANALYZE` list for the restored SDE tables (planner stats after pg_restore). */
export function sdeSeedAnalyzeSql(): string {
  return `ANALYZE ${SDE_SEED_TABLES.join(', ')}`;
}
