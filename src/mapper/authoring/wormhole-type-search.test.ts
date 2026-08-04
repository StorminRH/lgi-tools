import { describe, expect, it } from 'vitest';
import { wormholeTypeSearch } from './wormhole-type-search';

const CODES = ['B274', 'C247', 'K162', 'N770'] as const;

describe('wormhole type search', () => {
  const search = wormholeTypeSearch(CODES);

  it('parses a known code and empty input as unset', () => {
    expect(search.parse('b274')).toEqual({
      ok: true,
      params: { code: 'B274' },
    });
    expect(search.parse('')).toEqual({ ok: true, params: { code: null } });
    expect(search.parse('   ')).toEqual({ ok: true, params: { code: null } });
  });

  it('rejects unknown or malformed codes', () => {
    expect(search.parse('Z999')).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    });
    expect(search.parse('not-a-code')).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    });
  });

  it('suggests prefix matches including K162', async () => {
    await expect(search.suggest('k')).resolves.toEqual(['K162']);
    await expect(search.suggest('')).resolves.toEqual([...CODES]);
    await expect(search.suggest('B')).resolves.toEqual(['B274']);
  });
});
