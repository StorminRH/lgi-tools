type Deps = readonly unknown[] | undefined;

/** React re-runs an effect or memo on every render without deps, else when their count or any identity changes. */
function depsChanged(held: Deps, next: Deps): boolean {
  if (held === undefined || next === undefined) return true;
  return held.length !== next.length || next.some((dep, i) => !Object.is(dep, held[i]));
}

function mountedSlots() {
  return {
    states: [] as unknown[],
    setters: [] as ((next: unknown) => void)[],
    refs: [] as { current: unknown }[],
    memos: [] as { deps: Deps; value: unknown }[],
    effects: [] as { deps: Deps; cleanup: void | (() => void) }[],
  };
}

function rewound() {
  return { state: 0, ref: 0, memo: 0, effect: 0 };
}

/**
 * A stateful stand-in for React's hooks, for tests that mock 'react' and call
 * hooks and components as plain functions. Each kind of hook keeps its slots
 * by call order under its own cursor, so `states[i]` is the i-th useState of
 * a render, and `render` rewinds every cursor before it calls the component.
 * A hook called outside `render` takes the next slots, like a fresh mount.
 *
 * useState takes a lazy initializer and functional updates, and its setter is
 * stable per slot. useReducer keeps its state in the next useState slot, as
 * React keeps both in one hook list, and its dispatch reduces the slot's
 * latest state. useMemo and the effects re-run when their deps change by
 * count or `Object.is`, or on every render without deps. An effect runs
 * synchronously when called, after the previous run's cleanup, not after a
 * commit. useCallback hands back the callback it is given, unmemoized, so a
 * memo that depends on a callback recomputes each render and a test that
 * changes a mocked input reaches it. useSyncExternalStore reads the snapshot.
 *
 * The helper imports nothing from 'react', so a test can load it for its own
 * `vi.mock('react')`:
 * `const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());`
 */
export function createHookRuntime() {
  let slots = mountedSlots();
  let cursor = rewound();

  function useState<T>(init: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] {
    const { states, setters } = slots;
    const index = cursor.state++;
    if (!(index in states)) states[index] = typeof init === 'function' ? (init as () => T)() : init;
    const set = (setters[index] ??= (next) => {
      states[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(states[index]) : next;
    });
    return [states[index] as T, set];
  }

  function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S): [S, (action: A) => void] {
    const [state, set] = useState(() => initial);
    return [state, (action) => set((previous) => reducer(previous, action))];
  }

  function useRef<T>(initial: T): { current: T } {
    return (slots.refs[cursor.ref++] ??= { current: initial }) as { current: T };
  }

  function useMemo<T>(make: () => T, deps?: readonly unknown[]): T {
    const index = cursor.memo++;
    const held = slots.memos[index];
    if (held && !depsChanged(held.deps, deps)) return held.value as T;
    const value = make();
    slots.memos[index] = { deps, value };
    return value;
  }

  function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void {
    const index = cursor.effect++;
    const held = slots.effects[index];
    if (held && !depsChanged(held.deps, deps)) return;
    held?.cleanup?.();
    slots.effects[index] = { deps, cleanup: effect() };
  }

  function cleanUpEffects() {
    for (const effect of slots.effects) effect.cleanup?.();
    slots.effects = [];
  }

  return {
    react: {
      useState,
      useReducer,
      useRef,
      useMemo,
      useCallback: <T>(callback: T, _deps?: readonly unknown[]): T => callback,
      useEffect,
      useLayoutEffect: useEffect,
      useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T): T => getSnapshot(),
    },
    /** Rewinds every cursor, then calls the component or hook with `args`. */
    render<A extends unknown[], R>(component: (...args: A) => R, ...args: A): R {
      cursor = rewound();
      return component(...args);
    },
    /** Like a hidden Activity: every live effect cleans up, while state, refs and memos stay, so the next render runs the effects again. */
    hide: cleanUpEffects,
    /** Cleans up every live effect and drops every slot. A setter handed out before is then a no-op. */
    unmount() {
      cleanUpEffects();
      slots = mountedSlots();
      cursor = rewound();
    },
    /** The mounted useState values by call order, for a test to seed or read. */
    get states(): unknown[] {
      return slots.states;
    },
  };
}

/** Waits one zero-delay timer, so the promise callbacks and timers queued before it have run. Needs real timers. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
