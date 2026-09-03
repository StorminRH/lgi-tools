import { createHash } from 'node:crypto';
import { join } from 'node:path';

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

export const SDE_SEED_SOURCE_FILES = [
  'src/data/eve-data/coerce.ts',
  'src/data/eve-data/constants.ts',
  'src/data/eve-data/ingest.ts',
  'src/data/eve-data/meta.ts',
  'src/data/eve-data/schema.ts',
  'src/data/eve-data/source.ts',
  'src/data/eve-data/universe.ts',
] as const;

export const SDE_SEED_DUMP_FORMAT = 'pg-dump-Fc-data-only-v1';

const DUMP_PREFIX = 'sde-';
const DUMP_SUFFIX = '.dump';

export type SdeSeedAction = 'restore' | 'ingest';

export type SdeSeedArgs = {
  cacheDir: string | null;
  forceIngest: boolean;
};

export type SdeSeedPgTarget = {
  user: string;
  password: string;
  database: string;
  port: string;
};

export type DockerPgCommand = {
  file: string;
  args: string[];
  env: { PGPASSWORD: string };
};

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

export function sdeSeedDumpFileName(version: string, sourceHash: string): string {
  return `${DUMP_PREFIX}${version}-${sourceHash}${DUMP_SUFFIX}`;
}

export function sdeSeedDumpPath(
  cacheDir: string,
  version: string,
  sourceHash: string,
): string {
  return join(cacheDir, sdeSeedDumpFileName(version, sourceHash));
}

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

export type PreparedSdeSeed =
  | {
      action: 'restore';
      cacheDir: string;
      remoteVersion: string;
      sourceHash: string;
    }
  | {
      action: 'ingest';
      cacheDir: string | null;
      remoteVersion: string | null;
      sourceHash: string;
    };

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
  const action = resolveSdeSeedAction({
    cacheDir: args.cacheDir,
    remoteVersion: input.remoteVersion,
    dumpExists: dumpPath !== null && input.dumpExists(dumpPath),
    forceIngest: args.forceIngest,
  });
  if (action === 'restore') {
    if (args.cacheDir === null || input.remoteVersion === null) {
      throw new Error('SDE restore plan is missing a cache directory or remote version');
    }
    return {
      action,
      cacheDir: args.cacheDir,
      remoteVersion: input.remoteVersion,
      sourceHash,
    };
  }
  return {
    action,
    cacheDir: args.cacheDir,
    remoteVersion: input.remoteVersion,
    sourceHash,
  };
}

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

export function sdeSeedAnalyzeSql(): string {
  return `ANALYZE ${SDE_SEED_TABLES.join(', ')}`;
}
