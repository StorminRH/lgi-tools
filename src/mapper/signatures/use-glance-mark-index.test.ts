import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GlanceMarkIndexProvider,
  useGlanceMarks,
} from './use-glance-mark-index';

const paged = vi.hoisted(() => ({
  rows: [] as { systemId: number; group: string | null }[],
  read: vi.fn(),
}));

vi.mock('@/data/convex/use-drained-pages', () => ({
  useDrainedPages: (...args: unknown[]) => {
    paged.read(...args);
    return { rows: paged.rows, complete: true };
  },
}));

function MarksProbe({ systemId }: { readonly systemId: number }) {
  return createElement('output', null, useGlanceMarks(systemId).join(','));
}

describe('glance mark index', () => {
  beforeEach(() => {
    paged.rows = [];
    paged.read.mockClear();
  });

  it('drains the map-wide signature watch once and indexes identified buckets', () => {
    paged.rows = [
      { systemId: 1, group: 'Gas Site' },
      { systemId: 1, group: 'Combat Site' },
      { systemId: 2, group: null },
      { systemId: 2, group: 'Wormhole' },
    ];
    const markup = renderToStaticMarkup(
      createElement(
        GlanceMarkIndexProvider,
        { mapId: 'map-a' },
        createElement(MarksProbe, { systemId: 1 }),
        createElement(MarksProbe, { systemId: 2 }),
      ),
    );
    expect(paged.read.mock.calls[0]?.[1]).toEqual({ mapId: 'map-a' });
    expect(paged.read.mock.calls[0]?.[2]).toBe(100);
    expect(markup).toContain('<output>harvestables,combat</output>');
    expect(markup).toContain('<output></output>');
  });

  it('returns no marks without a provider', () => {
    expect(
      renderToStaticMarkup(createElement(MarksProbe, { systemId: 1 })),
    ).toContain('<output></output>');
  });
});
