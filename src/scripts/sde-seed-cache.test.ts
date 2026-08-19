import { describe, expect, it } from 'vitest';
import {
  SDE_SEED_SOURCE_FILES,
  SDE_SEED_TABLES,
  buildSdeDumpDockerCommand,
  buildSdeRestoreDockerCommand,
  hashSdeSeedSources,
  parseSdeSeedArgs,
  parseSdeSeedPgTarget,
  prepareSdeSeedRun,
  resolveSdeSeedAction,
  restoreTargetFromPlan,
  sdeSeedAnalyzeSql,
  sdeSeedDumpFileName,
  sdeSeedDumpPath,
} from './sde-seed-cache';

const CONTENTS = Object.fromEntries(
  SDE_SEED_SOURCE_FILES.map((path, index) => [path, `body-${index}`]),
) as Record<string, string>;

describe('parseSdeSeedArgs', () => {
  it('reads --cache-dir and --force', () => {
    expect(parseSdeSeedArgs(['--cache-dir', '/mnt/sde-cache', '--force'])).toEqual({
      cacheDir: '/mnt/sde-cache',
      forceIngest: true,
    });
  });

  it('falls back to the env path when the flag is omitted', () => {
    expect(parseSdeSeedArgs([], '/mnt/from-env')).toEqual({
      cacheDir: '/mnt/from-env',
      forceIngest: false,
    });
  });

  it('prefers --cache-dir over the env path', () => {
    expect(parseSdeSeedArgs(['--cache-dir', '/mnt/flag'], '/mnt/from-env')).toEqual({
      cacheDir: '/mnt/flag',
      forceIngest: false,
    });
  });

  it('treats a blank env path as missing', () => {
    expect(parseSdeSeedArgs([], '   ')).toEqual({
      cacheDir: null,
      forceIngest: false,
    });
  });

  it('throws when --cache-dir has no path', () => {
    expect(() => parseSdeSeedArgs(['--cache-dir'])).toThrow('--cache-dir requires a path');
    expect(() => parseSdeSeedArgs(['--cache-dir', '--force'])).toThrow(
      '--cache-dir requires a path',
    );
  });

  it('throws on an unknown flag', () => {
    expect(() => parseSdeSeedArgs(['--nope'])).toThrow('Unknown argument: --nope');
  });
});

describe('hashSdeSeedSources', () => {
  it('is stable for the same contents and changes when a file changes', () => {
    const first = hashSdeSeedSources(CONTENTS);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    expect(hashSdeSeedSources(CONTENTS)).toBe(first);
    const changed = { ...CONTENTS, [SDE_SEED_SOURCE_FILES[0]]: 'other' };
    expect(hashSdeSeedSources(changed)).not.toBe(first);
  });

  it('throws when a listed source file is missing', () => {
    const rest = { ...CONTENTS };
    delete rest[SDE_SEED_SOURCE_FILES[0]];
    expect(() => hashSdeSeedSources(rest)).toThrow(
      `Missing SDE seed source file: ${SDE_SEED_SOURCE_FILES[0]}`,
    );
  });
});

describe('sdeSeedDumpPath', () => {
  it('names the dump by CCP version and source hash', () => {
    expect(sdeSeedDumpFileName('3473160', 'abc123def456')).toBe(
      'sde-3473160-abc123def456.dump',
    );
    expect(sdeSeedDumpPath('/mnt/sde-cache', '3473160', 'abc123def456')).toBe(
      '/mnt/sde-cache/sde-3473160-abc123def456.dump',
    );
  });
});

describe('resolveSdeSeedAction', () => {
  const hit = {
    cacheDir: '/mnt/sde-cache',
    remoteVersion: '3473160',
    dumpExists: true,
    forceIngest: false,
  };

  it('restores only when a versioned dump is present', () => {
    expect(resolveSdeSeedAction(hit)).toBe('restore');
  });

  it.each([
    { name: 'no cache dir', patch: { cacheDir: null } },
    { name: 'unreachable manifest', patch: { remoteVersion: null } },
    { name: 'cache miss', patch: { dumpExists: false } },
    { name: 'forced ingest', patch: { forceIngest: true } },
  ])('ingests on $name', ({ patch }) => {
    expect(resolveSdeSeedAction({ ...hit, ...patch })).toBe('ingest');
  });
});

describe('prepareSdeSeedRun', () => {
  const sourceHash = hashSdeSeedSources(CONTENTS);
  const dumpPath = sdeSeedDumpPath('/mnt/sde-cache', '3473160', sourceHash);

  it('restores when the versioned dump exists', () => {
    const seen: string[] = [];
    const prepared = prepareSdeSeedRun({
      argv: ['--cache-dir', '/mnt/sde-cache'],
      cacheDirEnv: undefined,
      sourceContents: CONTENTS,
      remoteVersion: '3473160',
      dumpExists: (path) => {
        seen.push(path);
        return path === dumpPath;
      },
    });
    expect(seen).toEqual([dumpPath]);
    expect(prepared).toEqual({
      action: 'restore',
      cacheDir: '/mnt/sde-cache',
      remoteVersion: '3473160',
      sourceHash,
    });
  });

  it('ingests on a cache miss or when --force is set', () => {
    expect(
      prepareSdeSeedRun({
        argv: ['--cache-dir', '/mnt/sde-cache'],
        cacheDirEnv: undefined,
        sourceContents: CONTENTS,
        remoteVersion: '3473160',
        dumpExists: () => false,
      }).action,
    ).toBe('ingest');
    expect(
      prepareSdeSeedRun({
        argv: ['--cache-dir', '/mnt/sde-cache', '--force'],
        cacheDirEnv: undefined,
        sourceContents: CONTENTS,
        remoteVersion: '3473160',
        dumpExists: () => true,
      }).action,
    ).toBe('ingest');
  });
});

describe('restoreTargetFromPlan', () => {
  it('returns the cache dir and version from a restore plan', () => {
    expect(
      restoreTargetFromPlan({
        action: 'restore',
        cacheDir: '/mnt/sde-cache',
        remoteVersion: '3473160',
        sourceHash: 'abc',
      }),
    ).toEqual({ cacheDir: '/mnt/sde-cache', remoteVersion: '3473160' });
  });

  it('throws when the plan is missing a cache dir or version', () => {
    expect(() =>
      restoreTargetFromPlan({
        action: 'restore',
        cacheDir: null,
        remoteVersion: '3473160',
        sourceHash: 'abc',
      }),
    ).toThrow('missing a cache directory or remote version');
  });
});

describe('parseSdeSeedPgTarget', () => {
  it('reads user, password, database, and port', () => {
    expect(
      parseSdeSeedPgTarget('postgres://postgres:secret@localhost:5433/lgi'),
    ).toEqual({
      user: 'postgres',
      password: 'secret',
      database: 'lgi',
      port: '5433',
    });
  });

  it('defaults the port and decodes URI components', () => {
    expect(
      parseSdeSeedPgTarget('postgresql://user%40x:p%40ss@db.example/app'),
    ).toEqual({
      user: 'user@x',
      password: 'p@ss',
      database: 'app',
      port: '5432',
    });
  });

  it('throws when the username or database is missing', () => {
    expect(() => parseSdeSeedPgTarget('postgres://localhost/db')).toThrow(
      /username and database/,
    );
    expect(() => parseSdeSeedPgTarget('postgres://postgres@localhost/')).toThrow(
      /username and database/,
    );
  });
});

describe('docker pg commands', () => {
  const target = {
    user: 'postgres',
    password: 'pw',
    database: 'postgres',
    port: '5432',
  };

  it('forwards PGPASSWORD via env and mounts the cache disk', () => {
    const dump = buildSdeDumpDockerCommand('/mnt/sde-cache', 'sde-1-aa.dump', target);
    expect(dump.file).toBe('docker');
    expect(dump.env).toEqual({ PGPASSWORD: 'pw' });
    expect(dump.args).not.toContain('pw');
    expect(dump.args).toContain('--network');
    expect(dump.args).toContain('/mnt/sde-cache:/sde-cache');
    expect(dump.args).toContain('pg_dump');
    expect(dump.args).toContain('-Fc');
    expect(dump.args).toContain('--data-only');
    for (const table of SDE_SEED_TABLES) {
      expect(dump.args).toContain(`public.${table}`);
    }
    expect(dump.args.at(-1)).toBe('/sde-cache/sde-1-aa.dump');
  });

  it('restores with disabled triggers and parallel jobs', () => {
    const restore = buildSdeRestoreDockerCommand(
      '/mnt/sde-cache',
      'sde-1-aa.dump',
      target,
    );
    expect(restore.args).toContain('pg_restore');
    expect(restore.args).toContain('--disable-triggers');
    expect(restore.args).toContain('-j');
    expect(restore.args).toContain('4');
    expect(restore.args.at(-1)).toBe('/sde-cache/sde-1-aa.dump');
  });

  it('lists every seed table in ANALYZE', () => {
    const sql = sdeSeedAnalyzeSql();
    expect(sql.startsWith('ANALYZE ')).toBe(true);
    for (const table of SDE_SEED_TABLES) {
      expect(sql).toContain(table);
    }
  });
});
