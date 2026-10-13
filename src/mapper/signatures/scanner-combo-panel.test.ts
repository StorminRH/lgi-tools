import { createElement, isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import * as Combobox from '@/components/ui/combobox';
import { ScannerCombo } from './scanner-combo-panel';

const popup = vi.hoisted(() => ({ open: true, onOpenChange: () => undefined }));

vi.mock('./scanner-scroll-dismiss', () => ({
  useCloseOnScannerScroll: () => popup,
}));

type Props = Record<string, unknown> & { children?: unknown };
type Handler = (...args: never[]) => unknown;

function* elements(node: unknown): Generator<ReactElement<Props>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
    return;
  }
  if (!isValidElement<Props>(node)) return;
  yield node;
  yield* elements(node.props.children);
}

const GROUPS = [
  { label: 'Statics', items: [{ value: 'N110', text: 'N110', meta: 'HS' }] },
  { label: 'Inbound', items: [{ value: 'K162', text: 'K162', meta: '' }] },
];

function comboTree(
  overrides: Partial<Parameters<typeof ScannerCombo>[0]> = {},
): ReactElement<Props>[] {
  return [
    ...elements(
      ScannerCombo({
        query: 'N1',
        onQueryChange: vi.fn(),
        groups: GROUPS,
        browsing: false,
        browseFooter: 'Type to search other holes…',
        ariaLabel: 'Type WHL-001',
        fieldClassName: 'scanner-field',
        onCommitValue: vi.fn(),
        onCommitQuery: vi.fn(),
        ...overrides,
      }),
    ),
  ];
}

function keyDown(key: string) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    nativeEvent: { stopImmediatePropagation: vi.fn() },
  };
}

test('a press commits the pressed value, typing reaches the query, and Enter commits the typed text', () => {
  const onQueryChange = vi.fn();
  const onCommitValue = vi.fn();
  const onCommitQuery = vi.fn();
  const tree = comboTree({ onQueryChange, onCommitValue, onCommitQuery });
  const root = tree.find((node) => node.type === Combobox.Root)!.props;
  const field = tree.find((node) => node.type === Combobox.Field)!.props;
  const change = (value: string, reason: string) =>
    (root.onValueChange as Handler)(...([value, { reason }] as never[]));

  expect(root).toMatchObject({
    open: popup.open,
    onOpenChange: popup.onOpenChange,
    value: 'N1',
    items: ['N110', 'K162'],
    filter: null,
    openOnInputClick: true,
  });
  expect(field).toMatchObject({
    size: 'sm',
    placeholder: 'Unresolved',
    'aria-label': 'Type WHL-001',
    className: 'scanner-field',
  });

  // Base UI commits a press as one change carrying the pressed item's value.
  change('N110', 'item-press');
  expect(onCommitValue).toHaveBeenCalledExactlyOnceWith('N110');
  expect(onQueryChange).not.toHaveBeenCalled();

  change('N11', 'input-change');
  change('', 'input-clear');
  expect(onQueryChange.mock.calls).toEqual([['N11'], ['']]);
  expect(onCommitValue).toHaveBeenCalledOnce();

  const typing = keyDown('a');
  (field.onKeyDown as Handler)(...([typing] as never[]));
  expect(onCommitQuery).not.toHaveBeenCalled();
  expect(typing.preventDefault).not.toHaveBeenCalled();

  const enter = keyDown('Enter');
  (field.onKeyDown as Handler)(...([enter] as never[]));
  expect(onCommitQuery).toHaveBeenCalledExactlyOnceWith('N1');
  expect(enter.preventDefault).toHaveBeenCalledOnce();
  expect(enter.stopPropagation).toHaveBeenCalledOnce();
  expect(enter.nativeEvent.stopImmediatePropagation).toHaveBeenCalledOnce();
});

test('the field sits in the aside row only when an aside is given, and browsing shows group labels and the footer', () => {
  const panelOf = (tree: ReactElement<Props>[]) =>
    tree.find((node) => 'showLabels' in node.props)!.props;
  const rowOf = (tree: ReactElement<Props>[]) =>
    tree.find((node) => node.type === 'div');

  const bare = comboTree();
  const root = bare.find((node) => node.type === Combobox.Root)!;
  expect(rowOf(bare)).toBeUndefined();
  expect(
    [...elements(root.props.children)].filter(
      (node) => node.type === Combobox.Field,
    ),
  ).toHaveLength(1);
  expect(panelOf(bare)).toMatchObject({
    groups: GROUPS,
    itemValues: ['N110', 'K162'],
    showLabels: false,
    footer: null,
  });

  const empty = comboTree({ aside: null, browsing: true });
  const emptyRow = rowOf(empty)!;
  expect(
    [...elements(emptyRow.props.children)].map((node) => node.type),
  ).toEqual([Combobox.Field]);
  expect(panelOf(empty)).toMatchObject({
    showLabels: true,
    footer: 'Type to search other holes…',
  });

  const chip = createElement('span', { 'data-chip': '' }, 'C3');
  const withChip = rowOf(comboTree({ aside: chip }))!;
  expect(
    [...elements(withChip.props.children)].map((node) => node.type),
  ).toEqual([Combobox.Field, 'span']);
});
