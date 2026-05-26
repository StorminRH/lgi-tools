import { afterEach, describe, expect, it } from 'vitest';
import {
  registerSearchSource,
  searchAll,
  __resetSearchSources,
  type SearchContext,
  type SearchResult,
  type SearchSource,
} from './index';

function makeCtx(overrides: Partial<SearchContext> = {}): SearchContext {
  return {
    session: null,
    isAdmin: false,
    recents: [],
    ...overrides,
  };
}

function makeSource(name: string, results: SearchResult[], opts: Partial<SearchSource> = {}): SearchSource {
  return {
    name,
    async search() {
      return results;
    },
    ...opts,
  };
}

const ROW = (id: string, label: string): SearchResult => ({
  kind: 'site',
  id,
  label,
  href: `/x/${id}`,
});

afterEach(() => {
  __resetSearchSources();
});

describe('search registry', () => {
  it('returns empty when there are no registered sources', async () => {
    const out = await searchAll('anything', makeCtx());
    expect(out).toEqual([]);
  });

  it('omits sources without showOnEmpty when query is empty', async () => {
    registerSearchSource(makeSource('Sites', [ROW('1', 'one')]));
    const out = await searchAll('', makeCtx());
    expect(out).toEqual([]);
  });

  it('includes showOnEmpty sources when query is empty', async () => {
    registerSearchSource(makeSource('Recent', [ROW('1', 'one')], { showOnEmpty: true }));
    const out = await searchAll('', makeCtx());
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Recent');
  });

  it('drops sections whose source produced zero results', async () => {
    registerSearchSource(makeSource('Sites', []));
    registerSearchSource(makeSource('Tools', [ROW('1', 'one')]));
    const out = await searchAll('anything', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Tools']);
  });

  it('caps results per source at the default limit of 5', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ROW(String(i), `row-${i}`));
    registerSearchSource(makeSource('Sites', rows));
    const out = await searchAll('q', makeCtx());
    expect(out[0].results).toHaveLength(5);
  });

  it('respects an explicit per-source limit', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ROW(String(i), `row-${i}`));
    registerSearchSource(makeSource('Sites', rows, { limit: 2 }));
    const out = await searchAll('q', makeCtx());
    expect(out[0].results).toHaveLength(2);
  });

  it('preserves registration order across multiple sources', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    registerSearchSource(makeSource('Tools', [ROW('t', 'a-tool')]));
    registerSearchSource(makeSource('Commands', [ROW('c', 'a-command')]));
    const out = await searchAll('a', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Sites', 'Tools', 'Commands']);
  });

  it('forwards the SearchContext to each source', async () => {
    let captured: SearchContext | undefined;
    registerSearchSource({
      name: 'Sites',
      async search(_q, ctx) {
        captured = ctx;
        return [ROW('1', 'one')];
      },
    });
    const ctx = makeCtx({ isAdmin: true });
    await searchAll('q', ctx);
    expect(captured).toBe(ctx);
  });

  it('runs sources in parallel (slow source does not block fast one)', async () => {
    let slowResolved = false;
    registerSearchSource({
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        slowResolved = true;
        return [ROW('s', 'slow')];
      },
    });
    registerSearchSource({
      name: 'Fast',
      async search() {
        // If sources were sequential, the slow one would already be done.
        expect(slowResolved).toBe(false);
        return [ROW('f', 'fast')];
      },
    });
    const out = await searchAll('q', makeCtx());
    expect(out.map((s) => s.name).sort()).toEqual(['Fast', 'Slow']);
  });

  it('passes the trimmed query, not the raw input', async () => {
    let received = '';
    registerSearchSource({
      name: 'Sites',
      async search(q) {
        received = q;
        return [ROW('1', 'one')];
      },
    });
    await searchAll('   hello   ', makeCtx());
    expect(received).toBe('hello');
  });

  it('treats whitespace-only as empty (skips non-showOnEmpty sources)', async () => {
    registerSearchSource(makeSource('Sites', [ROW('1', 'one')]));
    const out = await searchAll('   ', makeCtx());
    expect(out).toEqual([]);
  });
});
