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

  it('accepts canonical codes leniently when the codex is unavailable', () => {
    const lenient = wormholeTypeSearch([], { lenient: true });
    expect(lenient.parse('Z999')).toEqual({
      ok: true,
      params: { code: 'Z999' },
    });
    expect(lenient.parse('not-a-code')).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    });
  });

  it('bounds suggestions to the suggest limit', async () => {
    const many = Array.from(
      { length: 20 },
      (_, index) => `C${String(index + 100)}`,
    );
    const bounded = wormholeTypeSearch(many);
    await expect(bounded.suggest('')).resolves.toHaveLength(12);
    await expect(bounded.suggest('C')).resolves.toHaveLength(12);
  });

  it('suggests prefix matches including K162', async () => {
    await expect(search.suggest('k')).resolves.toEqual(['K162']);
    await expect(search.suggest('')).resolves.toEqual([...CODES]);
    await expect(search.suggest('B')).resolves.toEqual(['B274']);
  });

  it('collapses duplicate SDE codes in suggestions', async () => {
    const searchWithDupes = wormholeTypeSearch([
      'C729',
      'C729',
      'C008',
      'C729',
      'B274',
    ]);
    await expect(searchWithDupes.suggest('c')).resolves.toEqual([
      'C008',
      'C729',
    ]);
    await expect(searchWithDupes.suggest('')).resolves.toEqual([
      'B274',
      'C008',
      'C729',
    ]);
  });
});
