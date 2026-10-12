import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';

/**
 * No outbound ESI call takes a lock of any kind (owner ruling, 2026-10-12).
 * Planner pages carry hundreds of items and the app runs serverless, so a
 * duplicate call right after an expiry is accepted: CCP serves its shared
 * copy or a 304, and the writes behind it are idempotent. The only lock
 * near CCP data is the SDE ingest, which is not an ESI path. This census
 * fails when any ESI path imports the advisory-lock helper or spells a
 * Postgres advisory-lock function itself.
 */

const ESI_PATHS = [
  'src/data/esi-store',
  'src/data/market-prices',
  'src/data/market-history',
  'src/data/industry-indices',
  'src/data/eve-status',
  'src/composition/sync',
  'src/platform/owner-sync',
  'src/platform/esi',
  'src/app/api/cron/refresh-industry-indices',
  'src/app/api/cron/refresh-prices',
];

const LOCK_IMPORT = /from\s+['"](?:@\/db\/advisory-lock|(?:\.\.\/)+db\/advisory-lock)['"]/;
const LOCK_CALL = /\bpg_(?:try_)?advisory_(?:xact_)?lock\b/;

/** Every lock import or call in a source, by the kind it is. */
export function lockFindings(source: string): string[] {
  const findings: string[] = [];
  if (LOCK_IMPORT.test(source)) findings.push('imports @/db/advisory-lock');
  const call = LOCK_CALL.exec(source);
  if (call !== null) findings.push(`calls ${call[0]}`);
  return findings;
}

const sources = listSourceFiles({
  roots: ESI_PATHS,
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

describe('no locks on any ESI path', () => {
  it('scans the ESI paths', () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(sources).toContain('src/data/esi-store/index.ts');
    expect(sources).toContain('src/platform/owner-sync/engine.ts');
  });

  it('finds no advisory-lock import or call in them', () => {
    const offenders = sources.flatMap((file) =>
      lockFindings(stripComments(readFileSync(file, 'utf8'))).map((finding) => `${file}: ${finding}`),
    );
    expect(offenders).toEqual([]);
  });

  it('flags a seeded import, a seeded try-lock and a seeded session lock, and ignores a comment', () => {
    expect(lockFindings("import { withAdvisoryLock } from '@/db/advisory-lock';")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings("import { ADVISORY_LOCKS } from '../../db/advisory-lock';")).toEqual(['imports @/db/advisory-lock']);
    expect(lockFindings('await sql`select pg_try_advisory_lock(${key})`;')).toEqual(['calls pg_try_advisory_lock']);
    expect(lockFindings('sql`select pg_advisory_xact_lock(1)`')).toEqual(['calls pg_advisory_xact_lock']);
    expect(lockFindings(stripComments('// pg_advisory_lock is never taken here\nconst x = 1;'))).toEqual([]);
  });
});
