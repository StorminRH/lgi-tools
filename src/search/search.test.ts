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
    id: name.toLowerCase(),
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
      id: 'sites',
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
      id: 'slow',
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        slowResolved = true;
        return [ROW('s', 'slow')];
      },
    });
    registerSearchSource({
      id: 'fast',
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
      id: 'sites',
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
      id: 'slow',
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
      id: 'sites',
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
      id: 'lazy',
      name: 'Lazy',
      async search() {
        return [ROW('l', 'lazy-row')];
      },
    };
    const load = vi.fn(async () => realSource);
    registerLazySearchSource({ id: 'lazy', name: 'Lazy', load });

    await searchAll('a', makeCtx());
    await searchAll('ab', makeCtx());
    await searchAll('abc', makeCtx());

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not invoke load() when the query is empty and showOnEmpty is false', async () => {
    const load = vi.fn(async () => makeSource('Lazy', []));
    registerLazySearchSource({ id: 'lazy', name: 'Lazy', load });

    await searchAll('', makeCtx());

    expect(load).not.toHaveBeenCalled();
  });

  it('retries load() on the next keystroke if the first load rejects', async () => {
    let attempts = 0;
    const realSource: SearchSource = {
      id: 'lazy',
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
    registerLazySearchSource({ id: 'lazy', name: 'Lazy', load });

    // Silence the searchAll console.warn for the first failing call so
    // it doesn't pollute test output. The behavior we care about is
    // that the rejected load promise gets cleared and the next
    // keystroke retries.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First call: lazy load rejects. searchAll drops the source for this
    // keystroke and returns the other sources' results (empty here since
    // it's the only source registered) — NOT a top-level rejection.
    const firstOut = await searchAll('a', makeCtx());
    expect(firstOut).toEqual([]);

    // Second call: load is retried (the rejected promise was cleared).
    const secondOut = await searchAll('a', makeCtx());
    expect(load).toHaveBeenCalledTimes(2);
    expect(secondOut).toHaveLength(1);
    expect(secondOut[0].results[0].label).toBe('lazy-row');

    warnSpy.mockRestore();
  });

  it('does not warn when a source rejects with AbortError', async () => {
    // Sim a lazy source that gets cancelled mid-flight: it throws
    // AbortError, but the parent signal is not yet aborted at the
    // searchAll level (e.g. an internal source-level abort).
    registerSearchSource({
      id: 'cancelled-lazy',
      name: 'CancelledLazy',
      async search() {
        throw new DOMException('Aborted', 'AbortError');
      },
    });
    registerSearchSource(makeSource('Working', [ROW('1', 'one')]));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await searchAll('q', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Working']);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not let one rejecting source poison the others', async () => {
    registerSearchSource({
      id: 'broken',
      name: 'Broken',
      async search() {
        throw new Error('source error');
      },
    });
    registerSearchSource(makeSource('Working', [ROW('1', 'one')]));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await searchAll('q', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Working']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"Broken" failed'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('honors a pre-aborted signal by throwing AbortError before delegating', async () => {
    const controller = new AbortController();
    controller.abort();
    const realSearch = vi.fn(async () => [ROW('l', 'lazy-row')]);
    registerLazySearchSource({
      id: 'lazy',
      name: 'Lazy',
      load: async () => ({ id: 'lazy', name: 'Lazy', search: realSearch }),
    });

    await expect(
      searchAll('a', makeCtx({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(realSearch).not.toHaveBeenCalled();
  });
});

describe('searchAll scoping', () => {
  it('treats an explicit undefined scope like an omitted one', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    expect(await searchAll('a', makeCtx(), undefined)).toEqual(await searchAll('a', makeCtx()));
  });

  it('returns the default full result when every id is listed', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    registerSearchSource(makeSource('Tools', [ROW('t', 'a-tool')]));
    expect(await searchAll('a', makeCtx(), ['sites', 'tools'])).toEqual(await searchAll('a', makeCtx()));
  });

  it('dispatches only to the scoped subset', async () => {
    const excluded = vi.fn(async () => [ROW('t', 'a-tool')]);
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    registerSearchSource({ id: 'tools', name: 'Tools', search: excluded });
    const out = await searchAll('a', makeCtx(), ['sites']);
    expect(out.map((s) => s.name)).toEqual(['Sites']);
    expect(excluded).not.toHaveBeenCalled();
  });

  it('does not load a lazy source that is scoped out', async () => {
    const load = vi.fn(async () => makeSource('Lazy', [ROW('l', 'lazy-row')]));
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    registerLazySearchSource({ id: 'lazy', name: 'Lazy', load });
    await searchAll('a', makeCtx(), ['sites']);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps registration order regardless of the scope order', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    registerSearchSource(makeSource('Tools', [ROW('t', 'a-tool')]));
    registerSearchSource(makeSource('Commands', [ROW('c', 'a-command')]));
    const out = await searchAll('a', makeCtx(), ['commands', 'sites']);
    expect(out.map((s) => s.name)).toEqual(['Sites', 'Commands']);
  });

  it('returns nothing for an empty scope', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    expect(await searchAll('a', makeCtx(), [])).toEqual([]);
  });

  it('ignores unknown source ids', async () => {
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    const out = await searchAll('a', makeCtx(), ['sites', 'no-such-source']);
    expect(out.map((s) => s.name)).toEqual(['Sites']);
  });

  it('applies showOnEmpty within the scope', async () => {
    registerSearchSource(makeSource('Recent', [ROW('r', 'a-recent')], { showOnEmpty: true }));
    registerSearchSource(makeSource('Sites', [ROW('s', 'a-site')]));
    expect((await searchAll('', makeCtx(), ['recent'])).map((s) => s.name)).toEqual(['Recent']);
    expect(await searchAll('', makeCtx(), ['sites'])).toEqual([]);
  });

  it('attributes a failure to the right source under scope', async () => {
    // Regression guard for the warn's array indexing: with only the second
    // source in scope, the settled array covers just the filtered subset —
    // indexing the full registry would blame 'Good' for 'Broken's failure.
    registerSearchSource(makeSource('Good', [ROW('g', 'a-good')]));
    registerSearchSource({
      id: 'broken',
      name: 'Broken',
      async search() {
        throw new Error('source error');
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await searchAll('a', makeCtx(), ['broken']);
    expect(out).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"Broken" failed'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('still throws AbortError when the signal aborts under scope', async () => {
    const controller = new AbortController();
    registerSearchSource({
      id: 'slow',
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        return [ROW('s', 'slow')];
      },
    });
    setTimeout(() => controller.abort(), 10);
    await expect(
      searchAll('q', makeCtx({ signal: controller.signal }), ['slow']),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
