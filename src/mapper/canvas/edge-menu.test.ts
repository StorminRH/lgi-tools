import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Id } from '@/data/convex/data-model';
import { EdgeContextMenu } from './EdgeContextMenu';
import {
  edgeMenuActions,
  edgeMenuConnectionId,
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
      severConnection: vi.fn(
        async (): Promise<{ outcome: 'retained' }> => ({ outcome: 'retained' }),
      ),
      restoreSeveredBranch: vi.fn(),
      restoreConnection: vi.fn(),
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
