import { describe, expect, it, vi } from 'vitest';
import {
  lazySearchSource,
  searchAll,
  searchOneSource,
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

describe('searchAll', () => {
  it('returns empty when there are no sources', async () => {
    const out = await searchAll([], 'anything', makeCtx());
    expect(out).toEqual([]);
  });

  it('omits sources without showOnEmpty when query is empty', async () => {
    const out = await searchAll([makeSource('Sites', [ROW('1', 'one')])], '', makeCtx());
    expect(out).toEqual([]);
  });

  it('includes showOnEmpty sources when query is empty', async () => {
    const out = await searchAll([makeSource('Recent', [ROW('1', 'one')], { showOnEmpty: true })], '', makeCtx());
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Recent');
  });

  it('drops sections whose source produced zero results', async () => {
    const out = await searchAll(
      [makeSource('Sites', []), makeSource('Tools', [ROW('1', 'one')])],
      'anything',
      makeCtx(),
    );
    expect(out.map((s) => s.name)).toEqual(['Tools']);
  });

  it('caps results per source at the default limit of 5', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ROW(String(i), `row-${i}`));
    const out = await searchAll([makeSource('Sites', rows)], 'q', makeCtx());
    expect(out[0]!.results).toHaveLength(5);
  });

  it('respects an explicit per-source limit', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ROW(String(i), `row-${i}`));
    const out = await searchAll([makeSource('Sites', rows, { limit: 2 })], 'q', makeCtx());
    expect(out[0]!.results).toHaveLength(2);
  });

  it('returns sections in the order of the sources it is given', async () => {
    const sites = makeSource('Sites', [ROW('s', 'a-site')]);
    const tools = makeSource('Tools', [ROW('t', 'a-tool')]);
    const commands = makeSource('Commands', [ROW('c', 'a-command')]);
    expect((await searchAll([sites, tools, commands], 'a', makeCtx())).map((s) => s.name)).toEqual([
      'Sites',
      'Tools',
      'Commands',
    ]);
    expect((await searchAll([commands, sites], 'a', makeCtx())).map((s) => s.name)).toEqual(['Commands', 'Sites']);
  });

  it('forwards the SearchContext to each source', async () => {
    let captured: SearchContext | undefined;
    const source: SearchSource = {
      id: 'sites',
      name: 'Sites',
      async search(_q, ctx) {
        captured = ctx;
        return [ROW('1', 'one')];
      },
    };
    const ctx = makeCtx({ isAdmin: true });
    await searchAll([source], 'q', ctx);
    expect(captured).toBe(ctx);
  });

  it('runs sources in parallel (slow source does not block fast one)', async () => {
    let slowResolved = false;
    const slow: SearchSource = {
      id: 'slow',
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        slowResolved = true;
        return [ROW('s', 'slow')];
      },
    };
    const fast: SearchSource = {
      id: 'fast',
      name: 'Fast',
      async search() {
        expect(slowResolved).toBe(false);
        return [ROW('f', 'fast')];
      },
    };
    const out = await searchAll([slow, fast], 'q', makeCtx());
    expect(out.map((s) => s.name).sort()).toEqual(['Fast', 'Slow']);
  });

  it('passes the trimmed query, not the raw input', async () => {
    let received = '';
    const source: SearchSource = {
      id: 'sites',
      name: 'Sites',
      async search(q) {
        received = q;
        return [ROW('1', 'one')];
      },
    };
    await searchAll([source], '   hello   ', makeCtx());
    expect(received).toBe('hello');
  });

  it('treats whitespace-only as empty (skips non-showOnEmpty sources)', async () => {
    const out = await searchAll([makeSource('Sites', [ROW('1', 'one')])], '   ', makeCtx());
    expect(out).toEqual([]);
  });

  it('throws AbortError if the signal aborts mid-flight', async () => {
    const controller = new AbortController();
    const slow: SearchSource = {
      id: 'slow',
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        return [ROW('s', 'slow')];
      },
    };
    setTimeout(() => controller.abort(), 10);
    await expect(searchAll([slow], 'q', makeCtx({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('forwards the signal to each source via the context', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const source: SearchSource = {
      id: 'sites',
      name: 'Sites',
      async search(_q, ctx) {
        received = ctx.signal;
        return [ROW('1', 'one')];
      },
    };
    await searchAll([source], 'q', makeCtx({ signal: controller.signal }));
    expect(received).toBe(controller.signal);
  });

  it('does not warn when a source rejects with AbortError', async () => {
    const cancelled: SearchSource = {
      id: 'cancelled-lazy',
      name: 'CancelledLazy',
      async search() {
        throw new DOMException('Aborted', 'AbortError');
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await searchAll([cancelled, makeSource('Working', [ROW('1', 'one')])], 'q', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Working']);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not let one rejecting source poison the others', async () => {
    const broken: SearchSource = {
      id: 'broken',
      name: 'Broken',
      async search() {
        throw new Error('source error');
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await searchAll([broken, makeSource('Working', [ROW('1', 'one')])], 'q', makeCtx());
    expect(out.map((s) => s.name)).toEqual(['Working']);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"Broken" failed'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

describe('lazySearchSource', () => {
  it('keeps the metadata and calls load() at most once across multiple keystrokes', async () => {
    const realSearch: SearchSource['search'] = async () =>
      Array.from({ length: 4 }, (_, i) => ROW(String(i), `lazy-row-${i}`));
    const load = vi.fn(async () => realSearch);
    const source = lazySearchSource({ id: 'lazy', name: 'Lazy', limit: 3, load });
    expect(source).toMatchObject({ id: 'lazy', name: 'Lazy', limit: 3 });
    expect(load).not.toHaveBeenCalled();

    const out = await searchAll([source], 'a', makeCtx());
    await searchAll([source], 'ab', makeCtx());
    await searchAll([source], 'abc', makeCtx());

    expect(out).toEqual([{ name: 'Lazy', results: [ROW('0', 'lazy-row-0'), ROW('1', 'lazy-row-1'), ROW('2', 'lazy-row-2')] }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not invoke load() when the query is empty and showOnEmpty is false', async () => {
    const load = vi.fn(async () => makeSource('Lazy', []).search);

    await searchAll([lazySearchSource({ id: 'lazy', name: 'Lazy', load })], '', makeCtx());

    expect(load).not.toHaveBeenCalled();
  });

  it('retries load() on the next keystroke if the first load rejects', async () => {
    let attempts = 0;
    const realSearch: SearchSource['search'] = async () => [ROW('l', 'lazy-row')];
    const load = vi.fn(async () => {
      attempts++;
      if (attempts === 1) throw new Error('network blip');
      return realSearch;
    });
    const source = lazySearchSource({ id: 'lazy', name: 'Lazy', load });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const firstOut = await searchAll([source], 'a', makeCtx());
    expect(firstOut).toEqual([]);

    const secondOut = await searchAll([source], 'a', makeCtx());
    expect(load).toHaveBeenCalledTimes(2);
    expect(secondOut).toHaveLength(1);
    expect(secondOut[0]!.results[0]!.label).toBe('lazy-row');

    warnSpy.mockRestore();
  });

  it('honors a pre-aborted signal by throwing AbortError before delegating', async () => {
    const controller = new AbortController();
    controller.abort();
    const realSearch = vi.fn(async () => [ROW('l', 'lazy-row')]);
    const source = lazySearchSource({ id: 'lazy', name: 'Lazy', load: async () => realSearch });

    await expect(searchAll([source], 'a', makeCtx({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(realSearch).not.toHaveBeenCalled();
  });
});

describe('searchOneSource', () => {
  it("returns the source's capped results, signed out with no recents", async () => {
    const seen: SearchContext[] = [];
    const rows = Array.from({ length: 4 }, (_, i) => ({ kind: 'structure', id: `s${i}`, label: `Azbel ${i}`, href: '#' }));
    const structures: SearchSource = {
      id: 'structures',
      name: 'Structures',
      limit: 2,
      async search(_query, ctx) {
        seen.push(ctx);
        return rows;
      },
    };
    const out = await searchOneSource('azb', structures, new AbortController().signal);
    expect(out.map((r) => r.label)).toEqual(['Azbel 0', 'Azbel 1']);
    expect(seen[0]).toMatchObject({ session: null, isAdmin: false, recents: [] });
  });

  it('returns an empty list when the source has nothing', async () => {
    expect(await searchOneSource('azb', makeSource('Structures', []), new AbortController().signal)).toEqual([]);
  });

  it('rejects with AbortError once its signal aborts, so a superseded lookup can be told apart', async () => {
    const controller = new AbortController();
    const slow: SearchSource = {
      id: 'slow',
      name: 'Slow',
      async search() {
        await new Promise((r) => setTimeout(r, 30));
        return [ROW('s', 'slow')];
      },
    };
    const pending = searchOneSource('q', slow, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
