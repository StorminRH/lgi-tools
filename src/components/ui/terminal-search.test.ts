import { isValidElement, type ReactElement } from 'react';
import { expect, test, vi } from 'vitest';

// A tiny hook runtime: state and refs persist by call order across renders,
// and effects run on every render.
const h = vi.hoisted(() => {
  const slots: { value: unknown }[] = [];
  const runtime = {
    index: 0,
    slot<T>(init: () => T): { value: T } {
      const index = runtime.index++;
      slots[index] ??= { value: init() };
      return slots[index] as { value: T };
    },
  };
  return runtime;
});

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: <T>(initial: T) => h.slot(() => ({ current: initial })).value,
  useState: <T>(initial: T) => {
    const state = h.slot(() => initial);
    return [state.value, (next: T) => { state.value = next; }];
  },
  useId: () => 'terminal-search',
  useEffect: (effect: () => void) => {
    effect();
  },
}));

import * as Combobox from './combobox';
import { TerminalSearch, type TerminalSearchProps } from './terminal-search';

type Props = Record<string, unknown> & { children?: unknown };
type Handler = (...args: never[]) => unknown;
type Unknown = { kind: 'unknown'; name: string };

function* elements(node: unknown): Generator<ReactElement<Props>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
    return;
  }
  if (!isValidElement<Props>(node)) return;
  yield node;
  yield* elements(node.props.children);
}

test('a picked suggestion submits once, and one that does not parse keeps its error until the next keystroke', async () => {
  const onSubmit = vi.fn();
  const props: TerminalSearchProps<{ typeId: number }, Unknown> = {
    initialValue: 'trit',
    parse: (input) =>
      input === 'Tritanium' ? { ok: true, params: { typeId: 34 } } : { ok: false, error: { kind: 'unknown', name: input } },
    suggest: () => ['Tritanium', 'Trit'],
    errorMessage: (error) => `No item named ${error.name}.`,
    onSubmit,
    onClear: vi.fn(),
  };
  const render = () => {
    h.index = 0;
    return [...elements(TerminalSearch(props))];
  };
  const root = () => render().find((node) => node.type === Combobox.Root)!.props;
  const footer = () => render().find((node) => 'errorLabel' in node.props)!.props;
  // What Base UI does on a press: the item's own click handler, then the commit
  // that fills the input with the item's value, then the close.
  const press = (value: string) => {
    const rootProps = root();
    const item = render().find((node) => node.type === Combobox.Item && node.props.value === value)!.props;
    (item.onClick as Handler | undefined)?.();
    (rootProps.onValueChange as Handler)(...([value, { reason: 'item-press' }] as never[]));
    (rootProps.onOpenChange as Handler)(...([false, { reason: 'item-press' }] as never[]));
  };

  render();
  await Promise.resolve();
  expect(root().items).toEqual(['Tritanium', 'Trit']);

  press('Tritanium');
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ typeId: 34 }, 'Tritanium');
  expect(root().value).toBe('Tritanium');
  expect(footer().error).toBeNull();

  (root().onValueChange as Handler)(...(['trit', { reason: 'input-change' }] as never[]));
  render();
  await Promise.resolve();
  press('Trit');
  expect(root().value).toBe('Trit');
  expect(footer().error).toEqual({ kind: 'unknown', name: 'Trit' });
  expect(onSubmit).toHaveBeenCalledOnce();

  (root().onValueChange as Handler)(...(['Trit ', { reason: 'input-change' }] as never[]));
  expect(footer().error).toBeNull();
});
