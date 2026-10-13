import { describe, expect, it } from 'vitest';
import { argumentSymbol, cachedScopes, cacheTagArguments } from './__tests__/cached-scopes';

const SOURCE = `
async function getRow(id: number) {
  'use cache: remote';
  cacheTag(datasetTag(key(id)), SDE_CACHE_TAG);
  const label = \`row {\${id}}\`;
  if (id === 0) { return null; }
  cacheLife(untilExpires(await storedExpiry([key(id)])));
  return label;
}

function plain() {
  return 'no directive';
}

async function getStatic() {
  'use cache';
  cacheLife('max');
  cacheTag(...tags(), eveTag('sde'));
  return 1;
}
`;

describe('cachedScopes', () => {
  it('returns each directive with the block that encloses it, braces in strings included', () => {
    const scopes = cachedScopes(SOURCE);
    expect(scopes.map((scope) => scope.directive)).toEqual(['use cache: remote', 'use cache']);
    expect(scopes[0]!.body).toContain('cacheLife(untilExpires(');
    expect(scopes[0]!.body).toContain('return label;');
    expect(scopes[0]!.body).not.toContain('plain');
    expect(scopes[1]!.body).toContain("cacheLife('max')");
  });

  it('throws on a block that never closes', () => {
    expect(() => cachedScopes("function f() {\n  'use cache';\n")).toThrow('Unbalanced block');
  });
});

describe('cacheTagArguments and argumentSymbol', () => {
  it('splits every cacheTag call into its top-level arguments', () => {
    const [remote, regular] = cachedScopes(SOURCE);
    expect(cacheTagArguments(remote!.body)).toEqual(['datasetTag(key(id))', 'SDE_CACHE_TAG']);
    expect(cacheTagArguments(regular!.body)).toEqual(['...tags()', "eveTag('sde')"]);
    expect(cacheTagArguments('nothing here')).toEqual([]);
  });

  it('names the symbol behind a spread, a call or a constant', () => {
    expect(argumentSymbol('...tags()')).toBe('tags');
    expect(argumentSymbol('datasetTag(key(id))')).toBe('datasetTag');
    expect(argumentSymbol('SDE_CACHE_TAG')).toBe('SDE_CACHE_TAG');
    expect(argumentSymbol("'literal'")).toBeNull();
  });
});
