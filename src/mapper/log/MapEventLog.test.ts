import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { MapEventLog } from './MapEventLog';
import type { MapEventRow } from './map-event-copy';

const state = vi.hoisted(() => ({ open: false }));
const liveValue = vi.hoisted(() => vi.fn());

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: () => [state.open, vi.fn()],
}));
vi.mock('@/data/convex/use-live-value', () => ({ useLiveValue: liveValue }));

vi.mock('@/components/ui/button', () => ({
  Button: (props: {
    children?: unknown;
    'data-map-event-restore'?: string;
  }) =>
    createElement(
      'button',
      { 'data-map-event-restore': props['data-map-event-restore'] },
      props.children as never,
    ),
}));

vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: (props: {
    header: unknown;
    children?: unknown;
  }) =>
    createElement(
      'div',
      { 'data-collapsible': '' },
      props.header as never,
      props.children as never,
    ),
}));

const NOW = 10_000;

function row(
  partial: Pick<MapEventRow, 'kind' | 'payload' | 'at'> & { id: string },
): MapEventRow {
  return {
    _id: partial.id as Id<'mapEvents'>,
    _creationTime: partial.at,
    mapId: 'map-a',
    actor: 'Pilot',
    purgeAfter: partial.at + 7 * 24 * 60 * 60 * 1000,
    kind: partial.kind,
    payload: partial.payload,
    at: partial.at,
  };
}

describe('MapEventLog', () => {
  beforeEach(() => {
    state.open = true;
    liveValue.mockReset();
    liveValue.mockReturnValue([]);
  });

  it('skips the detail subscription and omits count and rows when closed', () => {
    state.open = false;
    const markup = renderToStaticMarkup(createElement(MapEventLog, {
      mapId: 'map-a', canEdit: true, now: NOW, onRestore: vi.fn(),
    }));
    expect(liveValue.mock.calls[0]?.[1]).toBe('skip');
    expect(markup).toContain('Audit Log');
    expect(markup).not.toContain('data-map-event-log-count');
    expect(markup).not.toContain('data-map-event-log-rows');
  });

  it('shows loading rather than an empty result until the open subscription returns', () => {
    liveValue.mockReturnValue(undefined);
    const markup = renderToStaticMarkup(createElement(MapEventLog, {
      mapId: 'map-b', canEdit: true, now: NOW, onRestore: vi.fn(),
    }));
    expect(liveValue.mock.calls[0]?.[1]).toEqual({ mapId: 'map-b' });
    expect(markup).toContain('Loading map events');
    expect(markup).not.toContain('No map events yet');
    expect(markup).not.toContain('data-map-event-log-count');
  });

  it('renders empty state and gates Restore on canEdit + in-window rows', () => {
    const empty = renderToStaticMarkup(
      createElement(MapEventLog, {
        mapId: 'map-a',
        canEdit: true,
        now: NOW,
        onRestore: vi.fn(),
      }),
    );
    expect(empty).toContain('data-map-event-log');
    expect(empty).toContain('data-map-event-log-empty');
    expect(empty).toContain('Audit Log');
    expect(empty).toContain('Events - 0');

    const events = [
      row({
        id: 'e1',
        kind: 'branch_removed',
        at: NOW - 100,
        payload: { connectionId: 'c1', systemIds: [1, 2] },
      }),
      row({
        id: 'e2',
        kind: 'branch_restored',
        at: NOW - 50,
        payload: { connectionId: 'c1', systemIds: [1, 2] },
      }),
    ];

    liveValue.mockReturnValue(events);
    const editor = renderToStaticMarkup(
      createElement(MapEventLog, {
        mapId: 'map-a',
        canEdit: true,
        now: NOW,
        onRestore: vi.fn(),
      }),
    );
    expect(editor).toContain('data-map-event-restore');
    expect(editor).toContain('data-map-event-undoable="true"');
    expect(editor).not.toContain('map-chip-undo-pulse');
    expect(editor).toContain('bottom-4 right-14');
    expect(editor).toContain('Events - 2');
    expect(editor).toContain('Removed 2 downstream systems');
    expect(editor).toContain('Pilot');

    const viewer = renderToStaticMarkup(
      createElement(MapEventLog, {
        mapId: 'map-a',
        canEdit: false,
        now: NOW,
        onRestore: vi.fn(),
      }),
    );
    expect(viewer).toContain('data-map-event-row');
    expect(viewer).not.toContain('data-map-event-restore');
  });
});
