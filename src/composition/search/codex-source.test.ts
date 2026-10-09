import { describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({ apiFetch }));

import { registerLazySearchSource, searchAll, type SearchContext } from '@/platform/search';
import { codexSearchSource } from './codex-source';

const ENTRIES = [
  { kind: 'guides', key: 'rolling-a-c3-static', title: 'Rolling a C3 static' },
  { kind: 'wormholes', key: 'c247', title: 'C247' },
  { kind: 'classes', key: 'c5', title: 'C5' },
];

const ok = { ok: true, status: 200, data: { entries: ENTRIES } };
const ctx: SearchContext = { session: null, isAdmin: false, recents: [] };

registerLazySearchSource(codexSearchSource);

const GUIDE_SECTION = [
  {
    name: 'Codex',
    results: [
      {
        kind: 'codex',
        id: 'codex:guides/rolling-a-c3-static',
        label: 'Rolling a C3 static',
        sub: 'Guide',
        href: '/codex/guides/rolling-a-c3-static',
        iconText: 'CX',
        iconTone: 'green',
      },
    ],
  },
];

describe('codexSearchSource', () => {
  it('retries the index after a failed load, then finds pages by title and key and loads the index once', async () => {
    const FAILURE = 'searchAll: source "Codex" failed';
    const passThrough = console.warn;
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      if (args[0] !== FAILURE) passThrough(...args);
    });
    apiFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    expect(await searchAll('rolling', ctx, ['codex'])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(FAILURE, expect.any(Error));
    warn.mockRestore();

    apiFetch.mockReset().mockResolvedValue(ok);

    expect(await searchAll('rolling', ctx, ['codex'])).toEqual(GUIDE_SECTION);
    expect(await searchAll('a-c3-static', ctx, ['codex'])).toEqual(GUIDE_SECTION);
    expect(await searchAll('C247', ctx, ['codex'])).toEqual([
      {
        name: 'Codex',
        results: [
          {
            kind: 'codex',
            id: 'codex:wormholes/c247',
            label: 'C247',
            sub: 'Wormhole type',
            href: '/codex/wormholes/c247',
            iconText: 'CX',
            iconTone: 'blue',
          },
        ],
      },
    ]);
    expect(await searchAll('', ctx, ['codex'])).toEqual([]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
