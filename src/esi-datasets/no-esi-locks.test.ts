import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments, valueImportSpecifiers } from '@/lib/__tests__/source-scan';

/**
 * No outbound ESI call takes a lock of any kind (owner ruling, 2026-10-12).
 * Planner pages carry hundreds of items and the app runs serverless, so a
 * duplicate call right after an expiry is accepted: CCP serves its shared
 * copy or a 304, and the writes behind it are idempotent.
 *
 * The census scans every production file under src, not a list of ESI
 * roots, so a lock wrapped around a store call from any caller (auth,
 * features, composition) fails it. The only files allowed a lock are the
 * sensitive non-ESI jobs below; each must still hold one (no stale entry)
 * and none may import the ESI store or gate.
 */

const ALLOWED_LOCK_SITES: Readonly<Record<string, string>> = {
  'src/db/advisory-lock.ts': 'the lock helper and its key registry',
  'src/composition/pipelines/cron-gate.ts':
    'cron gate; ESI crons declare lock mode none (idempotency registry)',
  'src/composition/wh-statics-refresh.ts': 'WH statics promotion',
  'src/app/api/cron/refresh-wh-statics/declaration.ts': 'WH statics cron',
  'src/app/api/cron/refresh-sde/declaration.ts': 'SDE ingest cron',
  'src/app/api/cron/refresh-gsc/declaration.ts': 'GSC ingest cron',
  'src/app/api/cron/purge-maps/declaration.ts': 'map purge cron',
  'src/scripts/refresh-sde.ts': 'SDE ingest script',
  'src/scripts/ingest-sde-if-empty.ts': 'SDE bootstrap script',
};

const LOCK_MODULE = /(?:^|\/)advisory-lock(?:\/index)?(?:\.[cm]?[jt]s)?\/?$/;
const LOCK_CALL = /\bpg_(?:try_)?advisory_(?:xact_)?lock\b/;
const ESI_MODULE = /(?:^|\/)(?:data\/esi-store|platform\/esi|platform\/owner-sync)(?:\/|$)/;

/** Every lock import or call in a source, by the kind it is. */
export function lockFindings(source: string): string[] {
  const findings: string[] = [];
  if (valueImportSpecifiers(source).some((specifier) => LOCK_MODULE.test(specifier))) {
    findings.push('imports @/db/advisory-lock');
  }
  const call = LOCK_CALL.exec(source);
  if (call !== null) findings.push(`calls ${call[0]}`);
  return findings;
}

/** Lock findings in files outside the allowlist, as `file: finding`. */
function lockOffenders(files: readonly string[], read: (file: string) => string): string[] {
  return files
    .filter((file) => !(file in ALLOWED_LOCK_SITES))
    .flatMap((file) => lockFindings(read(file)).map((finding) => `${file}: ${finding}`));
}

const readStripped = (file: string): string => stripComments(readFileSync(file, 'utf8'));

const sources = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx', '.mts'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

describe('no locks on any ESI path', () => {
  it('scans every production file under src, ESI callers outside the store included', () => {
    expect(sources.length).toBeGreaterThan(500);
    expect(sources).toContain('src/data/esi-store/index.ts');
    expect(sources).toContain('src/platform/owner-sync/engine.ts');
    expect(sources).toContain('src/platform/auth/affiliation-source.ts');
    expect(sources).toContain('src/composition/structure-search.ts');
    expect(sources).toContain('src/features/character-sheet/refresh.ts');
  });

  it('finds no advisory-lock import or call outside the allowed non-ESI sites', () => {
    expect(lockOffenders(sources, readStripped)).toEqual([]);
  });

  it('keeps every allowed site real, holding a lock and importing no ESI module', () => {
    for (const file of Object.keys(ALLOWED_LOCK_SITES)) {
      expect(sources, file).toContain(file);
      const source = readStripped(file);
      expect(lockFindings(source), file).not.toEqual([]);
      expect(valueImportSpecifiers(source).filter((specifier) => ESI_MODULE.test(specifier)), file).toEqual([]);
    }
  });

  it('flags a seeded lock in a file outside the old ESI roots and spares an allowed site', () => {
    const seeded = "import { withAdvisoryLock } from '@/db/advisory-lock';";
    const read = (): string => seeded;
    expect(
      lockOffenders(['src/platform/auth/affiliation-source.ts', 'src/composition/wh-statics-refresh.ts'], read),
    ).toEqual(['src/platform/auth/affiliation-source.ts: imports @/db/advisory-lock']);
  });

  it('flags a seeded import, a seeded try-lock and a seeded session lock, and ignores a comment', () => {
    expect(lockFindings("import { withAdvisoryLock } from '@/db/advisory-lock';")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings("import { ADVISORY_LOCKS } from '../../db/advisory-lock';")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings("import { withAdvisoryLock } from '@/db/advisory-lock.ts';")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings("const { withAdvisoryLock } = await import('./advisory-lock');")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings('await sql`select pg_try_advisory_lock(${key})`;')).toEqual(['calls pg_try_advisory_lock']);
    expect(lockFindings('sql`select pg_advisory_xact_lock(1)`')).toEqual(['calls pg_advisory_xact_lock']);
    expect(lockFindings(stripComments('// pg_advisory_lock is never taken here\nconst x = 1;'))).toEqual([]);
  });
});
