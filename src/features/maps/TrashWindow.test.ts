import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@base-ui/react/dialog', async () => {
  const { StaticBaseDialog } = await import('@/components/ui/__tests__/static-base-dialog');
  return { Dialog: StaticBaseDialog };
});
vi.mock('@/components/ui/confirm-dialog', () => ({
  ConfirmDialog: ({ title }: { title: React.ReactNode }) =>
    createElement('div', { 'data-confirm-dialog': '' }, title),
}));

import {
  runMapLifecycleBatch,
  pruneTrashSelection,
  selectedCreatorMapIds,
  TrashWindow,
} from './TrashWindow';

const MAPS = [
  {
    id: 'created',
    name: 'Created map',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    archivedAt: new Date('2026-08-12T00:00:00.000Z'),
    creatorName: 'Mapper',
    role: 'admin' as const,
    provenance: { kind: 'created' as const },
  },
  {
    id: 'delegated',
    name: 'Delegated map',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    archivedAt: new Date('2026-08-12T00:00:00.000Z'),
    creatorName: 'Other',
    role: 'admin' as const,
    provenance: { kind: 'direct' as const, characterIds: [42] },
  },
];

describe('TrashWindow', () => {
  it('renders multi-select restore, creator-only purge eligibility, and selection pruning', () => {
    const markup = renderToStaticMarkup(
      createElement(TrashWindow, {
        open: true,
        onOpenChange: vi.fn(),
        maps: MAPS,
      }),
    );
    const label = markup.match(/<div role="dialog" aria-labelledby="([^"]+)"/)?.[1];
    expect(label).toBeTruthy();
    expect(markup.match(/<h2 id="([^"]+)"[^>]*>Deleted maps<\/h2>/)?.[1]).toBe(label);
    // Each row's checkbox is named by its map, without the provenance beside it.
    const names = [...markup.matchAll(/role="checkbox"[^>]* aria-labelledby="([^"]+)"/g)].map(
      ([, id]) => new RegExp(`<span id="${id}" hidden="">([^<]*)</span>`).exec(markup)?.[1],
    );
    expect(names).toEqual(['Created map', 'Delegated map']);
    expect(markup).toContain('Created by you');
    expect(markup).toContain('Admin access');
    expect(markup).toContain('Restore');
    expect(markup.match(/data-confirm-dialog/g)).toHaveLength(1);

    expect(selectedCreatorMapIds(MAPS, new Set(['created', 'delegated']))).toEqual([
      'created',
    ]);
    expect(
      [...pruneTrashSelection(new Set(['a', 'b', 'c']), ['a'])],
    ).toEqual(['b', 'c']);
  });

  it('runs a selected lifecycle batch serially, stopping at the first refusal', async () => {
    const refused = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    await expect(runMapLifecycleBatch(['a', 'b', 'c'], refused)).resolves.toEqual({
      succeeded: ['a'],
      complete: false,
    });
    expect(refused).toHaveBeenCalledTimes(2);
    expect(refused).toHaveBeenNthCalledWith(1, { mapId: 'a' });
    expect(refused).toHaveBeenNthCalledWith(2, { mapId: 'b' });

    const succeeded = vi.fn().mockResolvedValue({ ok: true });
    await expect(runMapLifecycleBatch(['a', 'b'], succeeded)).resolves.toEqual({
      succeeded: ['a', 'b'],
      complete: true,
    });
    expect(succeeded).toHaveBeenCalledTimes(2);
  });
});
