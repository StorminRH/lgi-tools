import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import type { ChainEdge } from '../chain/nodes';
import { EdgeContextMenu } from './EdgeContextMenu';
import {
  edgeAllowsPointerActions,
  edgeMenuActions,
  edgeMenuConnectionId,
  withEdgePointerPolicy,
  type EdgeMenuAnchor,
} from './edge-menu';

const announce = vi.hoisted(() => vi.fn());
vi.mock('../authoring/sever-toast', () => ({
  announceSeverOutcome: announce,
}));
vi.mock('../jump-client', () => ({ postJumpRequest: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast: { error: vi.fn() } }));

vi.mock('@/components/ui/pointer-menu', () => ({
  PointerMenu: (props: {
    open: boolean;
    anchor: unknown;
    label: string;
    children?: unknown;
  }) =>
    createElement(
      'div',
      {
        'data-pointer-menu': props.label,
        'data-open': props.open ? 'true' : 'false',
        'data-anchored': props.anchor === null ? 'false' : 'true',
      },
      props.children as never,
    ),
  MenuItem: ({
    children,
    onClick: _onClick,
    className: _className,
  }: {
    children?: unknown;
    onClick?: () => void;
    className?: string;
  }) => createElement('div', { role: 'menuitem' }, children as never),
  menuRow: '',
}));

vi.mock('@/components/ui/overlay-positioning', () => ({
  pointerAnchor: (x: number, y: number) => ({ x, y }),
}));

const CONNECTION_ID = 'c1' as Id<'mapConnections'>;

it('names authored editable connections only', () => {
  expect(
    edgeMenuConnectionId({ edgeId: 'c1', stub: false, canEdit: true }),
  ).toBe('c1');
  expect(
    edgeMenuConnectionId({ edgeId: 'c1', stub: false, canEdit: false }),
  ).toBeNull();
  expect(
    edgeMenuConnectionId({ edgeId: 'halo:1:2', stub: false, canEdit: true }),
  ).toBeNull();
  expect(
    edgeMenuConnectionId({ edgeId: 'c1', stub: true, canEdit: true }),
  ).toBeNull();
});

function chainEdge(
  overrides: Partial<ChainEdge> & Pick<ChainEdge, 'id' | 'data'>,
): ChainEdge {
  return { source: '1', target: '2', ...overrides };
}

it('keeps authored editable lines hit-testable and makes every other line inert', () => {
  const authored = chainEdge({ id: 'c1', data: { loop: false } });
  const halo = chainEdge({
    id: 'halo:1>2',
    data: { loop: false, halo: true },
  });
  const stub = chainEdge({
    id: 'stub-edge',
    data: { loop: false, stub: true },
  });
  const departing = chainEdge({
    id: 'c1',
    data: {
      loop: false,
      motion: { phase: 'departing', flavor: 'fade', reverse: false, heavy: false },
    },
  });
  const dying = chainEdge({
    id: 'c1',
    data: { loop: false, tombstoneState: 'dying' },
  });

  expect(edgeAllowsPointerActions(authored, true)).toBe(true);
  expect(edgeAllowsPointerActions(authored, false)).toBe(false);
  expect(edgeAllowsPointerActions(halo, true)).toBe(false);
  expect(edgeAllowsPointerActions(stub, true)).toBe(false);
  expect(edgeAllowsPointerActions(departing, true)).toBe(false);
  expect(edgeAllowsPointerActions(dying, true)).toBe(false);

  const [live, derived, ghost, stubbed, restorable] = withEdgePointerPolicy(
    [authored, halo, departing, stub, dying],
    true,
  );
  expect(live).toBe(authored);
  expect(live?.selectable).toBeUndefined();
  expect(derived).toMatchObject({
    id: 'halo:1>2',
    selectable: false,
    focusable: false,
  });
  expect(ghost).toMatchObject({ id: 'c1', selectable: false, focusable: false });
  expect(stubbed).toMatchObject({
    id: 'stub-edge',
    selectable: false,
    focusable: false,
  });
  expect(restorable).toMatchObject({
    id: 'c1',
    selectable: false,
    focusable: false,
  });
  expect(withEdgePointerPolicy([authored], false)[0]).toMatchObject({
    id: 'c1',
    selectable: false,
    focusable: false,
  });

  const alreadyInert = { ...halo, selectable: false, focusable: false };
  expect(withEdgePointerPolicy([alreadyInert], true)[0]).toBe(alreadyInert);
});

it('offers Edit and Delete when anchored and stays closed otherwise', () => {
  const menu: EdgeMenuAnchor = {
    connectionId: CONNECTION_ID,
    clientX: 40,
    clientY: 90,
  };
  const open = renderToStaticMarkup(
    createElement(EdgeContextMenu, {
      menu,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onOpenChange: vi.fn(),
    }),
  );
  expect(open).toContain('data-pointer-menu="Connection actions"');
  expect(open).toContain('data-open="true"');
  expect(open).toContain('data-anchored="true"');
  expect(open).toContain('>Edit<');
  expect(open).toContain('>Delete<');
  expect(open.match(/role="menuitem"/g)).toHaveLength(2);

  const closed = renderToStaticMarkup(
    createElement(EdgeContextMenu, {
      menu: null,
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onOpenChange: vi.fn(),
    }),
  );
  expect(closed).toContain('data-open="false"');
  expect(closed).toContain('data-anchored="false"');
});

it('opens the Signature Editor on Edit and severs through the shipped undo pathway on Delete', async () => {
  function authoring() {
    return {
      setConnectionWormholeType: vi.fn(),
      setConnectionShipSize: vi.fn(),
      setConnectionMassState: vi.fn(),
      setConnectionLifeStage: vi.fn(),
      setConnectionDestinationHint: vi.fn(),
      setConnectionDestination: vi.fn(),
      linkStubToResolvedConnection: vi.fn(),
      severConnection: vi.fn(
        async (): Promise<{ outcome: 'retained' }> => ({ outcome: 'retained' }),
      ),
      restoreSeveredBranch: vi.fn(),
      restoreConnection: vi.fn(),
      removeSignatures: vi.fn(),
      restoreSignatures: vi.fn(),
    };
  }

  const menu: EdgeMenuAnchor = {
    connectionId: CONNECTION_ID,
    clientX: 1,
    clientY: 2,
  };

  const openEditor = vi.fn();
  const closeMenu = vi.fn();
  edgeMenuActions({
    mapId: 'map-a',
    authoring: authoring(),
    openEditor,
    closeEditor: vi.fn(),
    closeMenu,
  }).onEdit(menu);
  expect(closeMenu).toHaveBeenCalledOnce();
  expect(openEditor).toHaveBeenCalledWith(CONNECTION_ID);

  announce.mockClear();
  const api = authoring();
  const closeEditor = vi.fn();
  edgeMenuActions({
    mapId: 'map-a',
    authoring: api,
    openEditor: vi.fn(),
    closeEditor,
    closeMenu: vi.fn(),
  }).onDelete(menu);
  await vi.waitFor(() => expect(announce).toHaveBeenCalledOnce());
  expect(api.severConnection).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION_ID,
  });
  expect(closeEditor).toHaveBeenCalledOnce();

  // The announced undo is the shipped branch restore, not a second rule.
  const call = announce.mock.calls[0]?.[0] as { onUndo: () => void };
  call.onUndo();
  expect(api.restoreSeveredBranch).toHaveBeenCalledWith({
    mapId: 'map-a',
    connectionId: CONNECTION_ID,
  });
});
