import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, stripComments } from '@/lib/__tests__/source-scan';
import { argumentSymbol, cachedScopes, cacheTagArguments, type CachedScope } from './__tests__/cached-scopes';

/**
 * Readers of stored EVE data have one shape: 'use cache: remote', a tag
 * derived through eveTag so the store's commit clears it, and a cacheLife
 * of untilExpires so Next drops the entry when CCP's copy is due. These
 * census tests hold every production source to that shape.
 *
 * One exception: a reader that only aggregates stored rows of a dataset
 * every write of which clears its tag (prices, and the industry indices'
 * adjusted prices, whose tag every cost-index or adjusted-price write
 * clears) lives until that clear, as cacheLife('max').
 * Its earliest stored expiry is nearly always past, since no view refreshes
 * every key behind it, so timing it by that would rebuild it on every request.
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
const MAX_LIFE = /\bcacheLife\('max'\)/;

/** Dataset tags that every write of the dataset clears, so an aggregate under one may live until the clear. */
const WRITE_CLEARED_TAGS = ['MARKET_PRICES_TAG', 'INDUSTRY_INDICES_TAG'];

/** The files holding those aggregate readers, pinned so a new one is a deliberate choice. */
const WRITE_CLEARED_READER_FILES = [
  'src/data/market-prices/cache.ts',
  'src/features/industry-planner/queries.ts',
  'src/features/wormhole-sites/queries.ts',
];

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

/** A remote entry that lives until a write clears its dataset tag: cacheLife('max') under a write-cleared tag. */
function livesUntilWriteClears(scope: CachedScope): boolean {
  return MAX_LIFE.test(scope.body) && cacheTagArguments(scope.body).some((argument) => WRITE_CLEARED_TAGS.includes(argument));
}

/** Whether production source clears `tag` on a write, through commit's tag or expireNow. */
function clearedOnWrite(tag: string): boolean {
  const clear = new RegExp(`\\btag:\\s*${tag}\\b|\\bexpireNow\\(${tag}\\)`);
  return [...sources.values()].some((source) => clear.test(source));
}

function isRemote(scope: CachedScope): boolean {
  return scope.directive === 'use cache: remote';
}

describe('remote readers of stored EVE data', () => {
  it('finds the readers', () => {
    expect(scopesByFile.filter((scope) => scope.directive === 'use cache: remote').length).toBeGreaterThan(10);
  });

  it('times every cacheLife(untilExpires(…)) reader as a remote entry tagged through eveTag', () => {
    const offenders = scopesByFile
      .filter((scope) => EXPIRY_LIFE.test(scope.body))
      .filter((scope) => !isRemote(scope) || !tagsEveData(scope))
      .map((scope) => scope.file);
    expect(offenders).toEqual([]);
  });

  it('gives every remote entry outside the scoreboard an expiry from the store, or a write-cleared life, and an eveTag-derived tag', () => {
    const offenders = scopesByFile
      .filter(isRemote)
      .filter((scope) => !REMOTE_SCOPES_WITHOUT_EXPIRY.includes(scope.file))
      .filter((scope) => !(EXPIRY_LIFE.test(scope.body) || livesUntilWriteClears(scope)) || !tagsEveData(scope))
      .map((scope) => scope.file);
    expect(offenders).toEqual([]);
  });

  it('allows a write-cleared life only under an eveTag-derived tag that a write clears', () => {
    for (const tag of WRITE_CLEARED_TAGS) {
      expect(derivesFromEveTag(tag), tag).toBe(true);
      expect(clearedOnWrite(tag), tag).toBe(true);
    }
    expect(clearedOnWrite('UNCLEARED_SYNTHETIC_TAG')).toBe(false);
  });

  it('pins the readers that live until a write clears their tag', () => {
    const files = scopesByFile.filter((scope) => isRemote(scope) && livesUntilWriteClears(scope)).map((scope) => scope.file);
    expect([...new Set(files)].sort()).toEqual(WRITE_CLEARED_READER_FILES);
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

  it('pins the scoreboard as the only remote entry without a store expiry or a write-cleared life', () => {
    const withoutExpiry = scopesByFile
      .filter((scope) => isRemote(scope) && !EXPIRY_LIFE.test(scope.body) && !livesUntilWriteClears(scope))
      .map((scope) => scope.file);
    expect([...new Set(withoutExpiry)].sort()).toEqual(REMOTE_SCOPES_WITHOUT_EXPIRY);
  });
});
