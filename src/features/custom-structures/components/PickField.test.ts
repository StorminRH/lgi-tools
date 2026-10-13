import { isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';
import * as Combobox from '@/components/ui/combobox';
import { PickField } from './PickField';

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

test('a press picks the item behind the pressed option even when names repeat, and only typing reaches the field', () => {
  const onValueChange = vi.fn();
  const onPick = vi.fn();
  const tree = [
    ...elements(
      PickField({
        value: 'Ama',
        onValueChange,
        onPick,
        options: [
          { key: '1021', label: 'Amamake Raitaru', meta: 'Amamake', item: { structureId: 1021 } },
          { key: '1022', label: 'Amamake Raitaru', meta: 'Amamake', item: { structureId: 1022 } },
        ],
      }),
    ),
  ];
  const root = tree.find((node) => node.type === Combobox.Root)!.props;
  const items = tree.filter((node) => node.type === Combobox.Item).map((node) => node.props);
  const change = (value: string, reason: string) =>
    (root.onValueChange as Handler)(...([value, { reason }] as never[]));

  expect(root.items).toEqual(['1021', '1022']);
  expect(items.map((item) => [item.value, item.onClick])).toEqual([
    ['1021', undefined],
    ['1022', undefined],
  ]);

  // Base UI commits a press as one change carrying the pressed item's value.
  change('1022', 'item-press');
  expect(onPick).toHaveBeenCalledExactlyOnceWith({ structureId: 1022 });
  expect(onValueChange).not.toHaveBeenCalled();

  change('Amam', 'input-change');
  expect(onValueChange).toHaveBeenCalledExactlyOnceWith('Amam');
  expect(onPick).toHaveBeenCalledOnce();
});
