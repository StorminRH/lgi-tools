import type { ReactElement } from 'react';
import { expect, test, vi } from 'vitest';

// A tiny hook runtime: state and refs persist by call order across renders,
// effects run on every render and hand back their cleanups.
const h = vi.hoisted(() => {
  const slots: { value: unknown }[] = [];
  const runtime = {
    index: 0,
    ids: 0,
    context: null as unknown,
    cleanups: [] as Array<() => void>,
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
  useCallback: <T>(callback: T) => callback,
  useMemo: <T>(factory: () => T) => factory(),
  useContext: () => h.context,
  useId: () => `token-${++h.ids}`,
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));

const toast = vi.hoisted(() => ({ loading: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast }));

import { LoadingToastProvider, useLoadingToast } from './loading-toast';

interface Context {
  readonly acquire: (token: string) => void;
  readonly release: (token: string) => void;
}

function renderProvider(): { ctx: Context; unmount: () => void } {
  h.index = 0;
  const before = h.cleanups.length;
  const element = LoadingToastProvider({ children: null }) as ReactElement<{ value: Context }>;
  const unmount = h.cleanups.splice(before).at(-1)!;
  return { ctx: element.props.value, unmount };
}

function Consumer({ active }: { readonly active: boolean }): null {
  useLoadingToast(active);
  return null;
}

function mountConsumer(active: boolean): (() => void) | undefined {
  const before = h.cleanups.length;
  Consumer({ active });
  return h.cleanups.splice(before)[0];
}

test('shows one sync toast while any consumer loads and dismisses it when the last one settles', () => {
  const { ctx } = renderProvider();
  expect(toast.loading).not.toHaveBeenCalled();
  expect(toast.dismiss).not.toHaveBeenCalled();

  // Outside a provider, or while idle, a consumer holds nothing.
  expect(mountConsumer(true)).toBeUndefined();
  h.context = ctx;
  expect(mountConsumer(false)).toBeUndefined();
  renderProvider();
  expect(toast.loading).not.toHaveBeenCalled();

  const releaseFirst = mountConsumer(true)!;
  const releaseSecond = mountConsumer(true)!;
  renderProvider();
  renderProvider();
  expect(toast.loading).toHaveBeenCalledTimes(1);
  expect(toast.loading).toHaveBeenCalledWith('Syncing…', { id: 'lgi-sync', duration: Infinity });

  releaseFirst();
  renderProvider();
  expect(toast.dismiss).not.toHaveBeenCalled();

  releaseSecond();
  const { unmount } = renderProvider();
  expect(toast.dismiss).toHaveBeenCalledTimes(1);
  expect(toast.dismiss).toHaveBeenLastCalledWith('lgi-sync');
  renderProvider();
  expect(toast.dismiss).toHaveBeenCalledTimes(1);

  // A fresh load shows the toast again; unmounting clears it.
  mountConsumer(true);
  renderProvider();
  expect(toast.loading).toHaveBeenCalledTimes(2);
  unmount();
  expect(toast.dismiss).toHaveBeenCalledTimes(2);
});
