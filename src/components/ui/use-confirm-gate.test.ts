import { expect, test, vi } from 'vitest';

// One gate per test: its reducer state lives in a single slot that each
// dispatch rewrites, so calling the hook again reads what the last handler did.
const slot = vi.hoisted(() => ({ state: undefined as unknown }));
vi.mock('react', () => ({
  useReducer: <S, A>(reducer: (state: S, action: A) => S, initial: S) => {
    slot.state ??= initial;
    return [slot.state, (action: A) => (slot.state = reducer(slot.state as S, action))];
  },
}));

import { useConfirmGate } from './use-confirm-gate';

test('a request opens on its target, a cancel closes but keeps it for the closing dialog, and the next request replaces it', () => {
  slot.state = undefined;
  let gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: false, busy: false, errored: false, target: null });

  gate.request('Home Chain');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, busy: false, target: 'Home Chain' });

  gate.cancel();
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: false, target: 'Home Chain' });

  gate.request('Corp Chain');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, target: 'Corp Chain' });
});

test('a run holds the dialog busy past cancel and request, a failure reopens it for a retry, and a success stays busy until reset', async () => {
  slot.state = undefined;
  let gate = useConfirmGate<string>();
  gate.request('Home Chain');
  gate = useConfirmGate<string>();

  let finish: (outcome: 'ok' | 'error') => void = () => {};
  const failing = gate.run(() => new Promise((resolve) => (finish = resolve)), (o) => o === 'error');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, busy: true });
  gate.cancel();
  gate.request('Corp Chain');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, busy: true, target: 'Home Chain' });

  finish('error');
  await expect(failing).resolves.toBe('error');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, busy: false, errored: true, target: 'Home Chain' });

  const retry = gate.run(() => Promise.resolve('ok' as const), (o) => o !== 'ok');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ busy: true, errored: false });
  await expect(retry).resolves.toBe('ok');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, busy: true });

  gate.reset();
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: false, busy: false, errored: false, target: 'Home Chain' });

  // A failure that is cancelled clears its error when the dialog next opens.
  gate.request('Corp Chain');
  await gate.run(() => Promise.resolve('error' as const), (o) => o === 'error');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, errored: true });
  gate.cancel();
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: false, errored: true });
  gate.request('Corp Chain');
  gate = useConfirmGate<string>();
  expect(gate).toMatchObject({ open: true, errored: false });
});
