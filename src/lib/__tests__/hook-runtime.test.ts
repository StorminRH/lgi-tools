import { expect, test, vi } from 'vitest';
import { createHookRuntime, settle } from './hook-runtime';

test('state keeps its slot by call order across renders, with a lazy initializer, functional updates and a stable setter', () => {
  const rt = createHookRuntime();
  const { react } = rt;
  const init = vi.fn(() => 'lazy');
  const counter = () => {
    const [count, setCount] = react.useState(0);
    react.useRef('a ref in between takes no state slot');
    const [label, setLabel] = react.useState<string>(init);
    return { count, setCount, label, setLabel };
  };

  const first = rt.render(counter);
  expect(first).toMatchObject({ count: 0, label: 'lazy' });
  first.setCount((count) => count + 1);
  first.setCount((count) => count + 1);
  first.setLabel('set');
  const second = rt.render(counter);
  expect(second).toMatchObject({ count: 2, label: 'set' });
  expect(second.setCount).toBe(first.setCount);
  expect(init).toHaveBeenCalledOnce();
  expect(rt.states).toEqual([2, 'set']);

  rt.states[0] = 7;
  expect(rt.render(counter).count).toBe(7);
  // Outside render the cursors run on, as a second mount's would.
  expect(counter()).toMatchObject({ count: 0, label: 'lazy' });
  expect(rt.states).toEqual([7, 'set', 0, 'lazy']);

  // A slot seeded before the first render is kept, and the others initialize.
  const seeded = createHookRuntime();
  seeded.states[1] = 'seeded';
  expect(seeded.render(() => [seeded.react.useState(1)[0], seeded.react.useState('unused')[0]])).toEqual([1, 'seeded']);
});

test('effects and memos re-run only when deps change by identity or count, or on every render without deps', () => {
  const rt = createHookRuntime();
  const { react } = rt;
  const seen: string[] = [];
  const watched = (label: string, deps?: readonly unknown[]) => {
    react.useLayoutEffect(() => {
      seen.push(`run ${label}`);
      return () => seen.push(`clean ${label}`);
    }, deps);
    return react.useMemo(() => label, deps);
  };
  const watch = (label: string, deps?: readonly unknown[]) => rt.render(watched, label, deps);
  const held = {};
  const other = {};

  expect(watch('a', [held])).toBe('a');
  expect(watch('b', [held])).toBe('a');
  expect(watch('c', [other])).toBe('c');
  // Only the count changes here, and in the next render back.
  expect(watch('d', [other, undefined])).toBe('d');
  expect(watch('e', [other])).toBe('e');
  expect(watch('f')).toBe('f');
  expect(watch('g')).toBe('g');
  expect(watch('h', [])).toBe('h');
  expect(watch('i', [])).toBe('h');
  expect(seen).toEqual([
    'run a', 'clean a', 'run c', 'clean c', 'run d', 'clean d', 'run e',
    'clean e', 'run f', 'clean f', 'run g', 'clean g', 'run h',
  ]);

  // useCallback is not memoized: the same deps still hand back the latest callback.
  const latest = () => 'latest';
  rt.render(() => react.useCallback(() => 'first', [held]));
  expect(rt.render(() => react.useCallback(latest, [held]))).toBe(latest);
});

test('hide cleans up live effects and keeps state, while unmount drops every slot and leaves old setters inert', () => {
  const rt = createHookRuntime();
  const { react } = rt;
  const seen: string[] = [];
  const component = () => {
    const [count, setCount] = react.useState(0);
    const renders = react.useRef(0);
    renders.current += 1;
    react.useEffect(() => {
      seen.push(`subscribe ${count}`);
      return () => seen.push(`unsubscribe ${count}`);
    }, [count]);
    const store = react.useSyncExternalStore(() => () => {}, () => `store ${count}`);
    return { count, setCount, renders: renders.current, store };
  };

  const mounted = rt.render(component);
  mounted.setCount(1);
  expect(rt.render(component)).toMatchObject({ count: 1, renders: 2, store: 'store 1' });
  rt.hide();
  expect(seen).toEqual(['subscribe 0', 'unsubscribe 0', 'subscribe 1', 'unsubscribe 1']);
  expect(rt.render(component)).toMatchObject({ count: 1, renders: 3 });
  expect(seen.at(-1)).toBe('subscribe 1');

  rt.unmount();
  expect(seen.at(-1)).toBe('unsubscribe 1');
  mounted.setCount(5);
  expect(rt.render(component)).toMatchObject({ count: 0, renders: 1 });
  expect(rt.states).toEqual([0]);
  expect(seen.at(-1)).toBe('subscribe 0');
});

test('settle lets promise callbacks and zero-delay timers queued before it run', async () => {
  const seen: string[] = [];
  setTimeout(() => seen.push('timer'), 0);
  void Promise.resolve().then(() => seen.push('promise'));
  expect(seen).toEqual([]);
  await settle();
  expect(seen).toEqual(['promise', 'timer']);
});
