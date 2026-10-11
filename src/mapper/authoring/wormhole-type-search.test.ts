import { describe, expect, it, vi } from 'vitest';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', () => rt.react);

import { useWormholeTypeSearch, wormholeTypeSearch } from './wormhole-type-search';

const CODES = ['B274', 'C247', 'K162', 'N770'] as const;

describe('wormhole type search', () => {
  it('parses known codes, rejects unknowns, and accepts lenient canonical codes', () => {
    const search = wormholeTypeSearch(CODES);

    expect(search.parse('b274')).toEqual({
      ok: true,
      params: { code: 'B274' },
    });
    expect(search.parse('')).toEqual({ ok: true, params: { code: null } });
    expect(search.parse('   ')).toEqual({ ok: true, params: { code: null } });
    expect(search.parse('Z999')).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    });
    expect(search.parse('not-a-code')).toEqual({
      ok: false,
      error: { kind: 'not_found' },
    });

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

  it('suggests bounded, deduped prefixes with origin statics first', async () => {
    const search = wormholeTypeSearch(CODES);
    await expect(search.suggest('k')).resolves.toEqual(['K162']);
    await expect(search.suggest('')).resolves.toEqual([...CODES]);
    await expect(search.suggest('B')).resolves.toEqual(['B274']);

    const many = Array.from(
      { length: 20 },
      (_, index) => `C${String(index + 100)}`,
    );
    const bounded = wormholeTypeSearch(many);
    await expect(bounded.suggest('')).resolves.toHaveLength(12);
    await expect(bounded.suggest('C')).resolves.toHaveLength(12);

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

    const preferred = wormholeTypeSearch(CODES, {
      preferredCodes: ['N770', 'B274', 'N770', 'Z999'],
    });
    await expect(preferred.suggest('')).resolves.toEqual([
      'B274',
      'N770',
      'C247',
      'K162',
    ]);
    await expect(preferred.suggest('k')).resolves.toEqual(['K162']);

    const searchOnly = wormholeTypeSearch(CODES, { preferredCodes: [] });
    await expect(searchOnly.suggest('')).resolves.toEqual([...CODES]);
  });
});

it('keeps one hook search per code list, lenient only while the codex has no codes', async () => {
  const codes = ['B274', 'K162'];
  const preferred = ['K162'];
  const loaded = rt.render(useWormholeTypeSearch, codes, preferred);
  expect(rt.render(useWormholeTypeSearch, codes, preferred)).toBe(loaded);
  await expect(loaded.suggest('')).resolves.toEqual(['K162', 'B274']);
  expect(loaded.parse('Z999')).toEqual({
    ok: false,
    error: { kind: 'not_found' },
  });

  const loading = rt.render(useWormholeTypeSearch, [], preferred);
  expect(loading).not.toBe(loaded);
  expect(loading.parse('Z999')).toEqual({
    ok: true,
    params: { code: 'Z999' },
  });
  rt.unmount();
});
