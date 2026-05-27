import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  registerSearchSource,
  registerLazySearchSource,
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

  it('throws AbortError if the signal aborts mid-flight', async () => {
    const controller = new AbortController();
    registerSearchSource({
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        return [ROW('s', 'slow')];
      },
    });
    setTimeout(() => controller.abort(), 10);
    await expect(
      searchAll('q', makeCtx({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('forwards the signal to each source via the context', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    registerSearchSource({
      name: 'Sites',
      async search(_q, ctx) {
        received = ctx.signal;
        return [ROW('1', 'one')];
      },
    });
    await searchAll('q', makeCtx({ signal: controller.signal }));
    expect(received).toBe(controller.signal);
  });
});

describe('registerLazySearchSource', () => {
  it('calls load() at most once across multiple keystrokes', async () => {
    const realSource: SearchSource = {
      name: 'Lazy',
      async search() {
        return [ROW('l', 'lazy-row')];
      },
    };
    const load = vi.fn(async () => realSource);
    registerLazySearchSource({ name: 'Lazy', load });

    await searchAll('a', makeCtx());
    await searchAll('ab', makeCtx());
    await searchAll('abc', makeCtx());

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not invoke load() when the query is empty and showOnEmpty is false', async () => {
    const load = vi.fn(async () => makeSource('Lazy', []));
    registerLazySearchSource({ name: 'Lazy', load });

    await searchAll('', makeCtx());

    expect(load).not.toHaveBeenCalled();
  });

  it('retries load() on the next keystroke if the first load rejects', async () => {
    let attempts = 0;
    const realSource: SearchSource = {
      name: 'Lazy',
      async search() {
        return [ROW('l', 'lazy-row')];
      },
    };
    const load = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('network blip');
      return realSource;
    });
    registerLazySearchSource({ name: 'Lazy', load });

    // First call fails — the rejected load promise must NOT be cached,
    // or the source stays broken for the rest of the session.
    await expect(searchAll('a', makeCtx())).rejects.toThrow('network blip');

    // Second call should retry and succeed.
    const out = await searchAll('a', makeCtx());
    expect(load).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(1);
    expect(out[0].results[0].label).toBe('lazy-row');
  });

  it('honors a pre-aborted signal by throwing AbortError before delegating', async () => {
    const controller = new AbortController();
    controller.abort();
    const realSearch = vi.fn(async () => [ROW('l', 'lazy-row')]);
    registerLazySearchSource({
      name: 'Lazy',
      load: async () => ({ name: 'Lazy', search: realSearch }),
    });

    await expect(
      searchAll('a', makeCtx({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(realSearch).not.toHaveBeenCalled();
  });
});
