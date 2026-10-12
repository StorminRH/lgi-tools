import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';
import { argumentSymbol, cachedScopes, cacheTagArguments, type CachedScope } from './__tests__/cached-scopes';

/**
 * Readers of stored EVE data have one shape: 'use cache: remote', a tag
 * derived through eveTag so the store's commit clears it, and a cacheLife
 * of untilExpires so Next drops the entry when CCP's copy is due. These
 * census tests hold every production source to that shape.
 */

const PRODUCTION_SOURCES = listSourceFiles({
  roots: ['src'],
  extensions: ['.ts', '.tsx'],
  skipDirectories: ['node_modules', '__fixtures__', '__tests__', '_generated'],
  skipSuffixes: ['.test.ts', '.test.tsx', '.d.ts'],
});

/** The scoreboard caches ESI health, not EVE data, so it keeps its own profile. */
const REMOTE_SCOPES_WITHOUT_EXPIRY = ['src/composition/esi-health.ts'];

const EXPIRY_LIFE = /\bcacheLife\(untilExpires\(/;

const sources = new Map(PRODUCTION_SOURCES.map((file) => [file, stripComments(readFileSync(file, 'utf8'))] as const));

const scopesByFile = [...sources].flatMap(([file, source]) =>
  cachedScopes(source).map((scope) => ({ file, ...scope })),
);

/** Whether `symbol` is defined somewhere in production source as, or through, an eveTag call. */
function derivesFromEveTag(symbol: string): boolean {
  if (symbol === 'eveTag') return true;
  const definition = new RegExp(`(?:const|function)\\s+${symbol}\\b[\\s\\S]{0,400}?\\beveTag\\(`);
  return [...sources.values()].some((source) => definition.test(source));
}

function tagsEveData(scope: CachedScope): boolean {
  return cacheTagArguments(scope.body).some((argument) => {
    const symbol = argumentSymbol(argument);
    return symbol !== null && derivesFromEveTag(symbol);
  });
}

describe('remote readers of stored EVE data', () => {
  it('finds the readers', () => {
    expect(scopesByFile.filter((scope) => scope.directive === 'use cache: remote').length).toBeGreaterThan(10);
  });

  it('times every cacheLife(untilExpires(…)) reader as a remote entry tagged through eveTag', () => {
    const offenders = scopesByFile
      .filter((scope) => EXPIRY_LIFE.test(scope.body))
      .filter((scope) => scope.directive !== 'use cache: remote' || !tagsEveData(scope))
      .map((scope) => scope.file);
    expect(offenders).toEqual([]);
  });

  it('gives every remote entry outside the scoreboard an expiry from the store and an eveTag-derived tag', () => {
    const offenders = scopesByFile
      .filter((scope) => scope.directive === 'use cache: remote')
      .filter((scope) => !REMOTE_SCOPES_WITHOUT_EXPIRY.includes(scope.file))
      .filter((scope) => !EXPIRY_LIFE.test(scope.body) || !tagsEveData(scope))
      .map((scope) => scope.file);
    expect(offenders).toEqual([]);
  });

  it('keeps cacheLife(untilExpires(…)) inside directive scopes only', () => {
    const offenders = [...sources]
      .filter(([, source]) => EXPIRY_LIFE.test(source))
      .filter(([, source]) => {
        const inside = cachedScopes(source).map((scope) => scope.body).join('\n');
        return source.match(/\bcacheLife\(untilExpires\(/g)!.length !== (inside.match(/\bcacheLife\(untilExpires\(/g) ?? []).length;
      })
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('pins the scoreboard as the only remote entry without a store expiry', () => {
    const withoutExpiry = scopesByFile
      .filter((scope) => scope.directive === 'use cache: remote' && !EXPIRY_LIFE.test(scope.body))
      .map((scope) => scope.file);
    expect([...new Set(withoutExpiry)].sort()).toEqual(REMOTE_SCOPES_WITHOUT_EXPIRY);
  });
});
