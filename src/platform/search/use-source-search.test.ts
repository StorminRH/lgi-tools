import { expect, test, vi } from 'vitest';

// platform/search may not import lib, so the hooks run on a small local stand-in
// for React instead of lib's hook runtime. State and refs keep their slots by
// call order across renders, and an effect runs again, after its last cleanup,
// only when one of its deps changes. `unmount` cleans up and drops every slot.
const rt = vi.hoisted(() => {
  type Effect = { deps: readonly unknown[]; cleanup: void | (() => void) };
  const empty = () => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as Effect[] });
  const at = { slots: empty(), state: 0, ref: 0, effect: 0 };
  return {
    react: {
      useState(initial: unknown) {
        const { states } = at.slots;
        const index = at.state++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next: unknown) => void (states[index] = next)];
      },
      useRef: (initial: unknown) => (at.slots.refs[at.ref++] ??= { current: initial }),
      useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
        const index = at.effect++;
        const held = at.slots.effects[index];
        if (held && deps.every((dep, i) => Object.is(dep, held.deps[i]))) return;
        held?.cleanup?.();
        at.slots.effects[index] = { deps, cleanup: effect() };
      },
    },
    render<A extends unknown[], R>(hook: (...args: A) => R, ...args: A): R {
      at.state = at.ref = at.effect = 0;
      return hook(...args);
    },
    unmount() {
      for (const effect of at.slots.effects) effect.cleanup?.();
      at.slots = empty();
    },
  };
});

vi.mock('react', () => rt.react);

import { useSearchAnswer, useSourceSearch } from './use-source-search';

/** A search whose every run waits for the test to settle it. */
function heldSearch() {
  const runs: { signal: AbortSignal; settle: PromiseWithResolvers<string[]> }[] = [];
  const search = vi.fn((_query: string, signal: AbortSignal) => {
    const settle = Promise.withResolvers<string[]>();
    runs.push({ signal, settle });
    return settle.promise;
  });
  return { search, runs };
}

test('answers the query that held for the debounce, tagged with it, and only the latest run lands', async () => {
  vi.useFakeTimers();
  rt.unmount();
  const { search, runs } = heldSearch();
  const answer = (query: string) => rt.render(useSearchAnswer<string[]>, query, search, 100);

  expect(answer('ve')).toBeNull();
  await vi.advanceTimersByTimeAsync(99);
  // A keystroke inside the window restarts it, so only the settled query is searched.
  answer('vel');
  await vi.advanceTimersByTimeAsync(99);
  expect(search).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(search).toHaveBeenCalledExactlyOnceWith('vel', runs[0]!.signal);
  expect(answer('vel')).toBeNull();

  // The next settled query aborts the run still out, and that run's late result is dropped.
  answer('veld');
  await vi.advanceTimersByTimeAsync(100);
  expect(search).toHaveBeenLastCalledWith('veld', runs[1]!.signal);
  expect(runs[0]!.signal.aborted).toBe(true);
  runs[0]!.settle.resolve(['Veldspar']);
  await vi.advanceTimersByTimeAsync(0);
  expect(answer('veld')).toBeNull();
  runs[1]!.settle.resolve(['Veldspar', 'Dense Veldspar']);
  await vi.advanceTimersByTimeAsync(0);
  expect(answer('veld')).toEqual({ query: 'veld', result: ['Veldspar', 'Dense Veldspar'] });

  // A rejected run keeps the last answer, still tagged with the query it answered.
  answer('velds');
  await vi.advanceTimersByTimeAsync(100);
  runs[2]!.settle.reject(new Error('source down'));
  await vi.advanceTimersByTimeAsync(0);
  expect(answer('velds')).toEqual({ query: 'veld', result: ['Veldspar', 'Dense Veldspar'] });

  // Unmounting aborts the run still out.
  answer('veldsp');
  await vi.advanceTimersByTimeAsync(100);
  expect(runs[3]!.signal.aborted).toBe(false);
  rt.unmount();
  expect(runs[3]!.signal.aborted).toBe(true);
  vi.useRealTimers();
});

test('field hits are one shared frozen empty list before the first answer, then the latest answer whatever it answered', async () => {
  vi.useFakeTimers();
  rt.unmount();
  const search = vi.fn(async (query: string) => [`${query} hit`]);
  const hits = (query: string) => rt.render(useSourceSearch<string>, query, search, 50);

  const empty = hits('tri');
  expect(empty).toEqual([]);
  expect(Object.isFrozen(empty)).toBe(true);
  rt.unmount();
  expect(hits('tri')).toBe(empty);

  await vi.advanceTimersByTimeAsync(50);
  expect(hits('tri')).toEqual(['tri hit']);
  // While the next query waits out its debounce, the last hits stay.
  expect(hits('trit')).toEqual(['tri hit']);
  search.mockRejectedValueOnce(new Error('source down'));
  await vi.advanceTimersByTimeAsync(50);
  expect(hits('trit')).toEqual(['tri hit']);
  rt.unmount();
  vi.useRealTimers();
});
