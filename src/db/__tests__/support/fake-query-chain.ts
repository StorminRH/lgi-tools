const CHAINABLE_METHODS = [
  'where',
  'set',
  'values',
  'onConflictDoUpdate',
  'onConflictDoNothing',
  'innerJoin',
  'leftJoin',
  'groupBy',
  'orderBy',
  'limit',
  'returning',
  // Drizzle's .for() returns the builder, so the awaited query takes the result.
  'for',
] as const;

function zeroCalls() {
  return { select: 0, insert: 0, update: 0, delete: 0, execute: 0, transaction: 0 };
}

/**
 * A Drizzle-shaped fake for unit tests that mock `@/db`. Every builder method
 * returns the same chain, and each awaited query takes the next entry of
 * `state.results` (FIFO). A queued rejected Promise rejects that await. An
 * empty queue resolves `whenEmpty` ([] by default), while a queued
 * `undefined` still resolves `undefined`. `from`, `insert`, `update` and
 * `delete` record `{ op, table }`; `from` always records a select.
 * `execute()` resolves [] without taking a result, and `transaction(work)`
 * runs `work` with the chain as the transaction.
 */
export function createFakeQueryChain(options: { whenEmpty?: unknown } = {}) {
  const whenEmpty = 'whenEmpty' in options ? options.whenEmpty : [];
  const state = {
    results: [] as unknown[],
    recorded: [] as { op: 'select' | 'insert' | 'update' | 'delete'; table: unknown }[],
    calls: zeroCalls(),
  };
  const chain: Record<string, unknown> = {};
  const write = (op: 'insert' | 'update' | 'delete') => (table: unknown) => {
    state.calls[op] += 1;
    state.recorded.push({ op, table });
    return chain;
  };

  for (const method of CHAINABLE_METHODS) chain[method] = () => chain;
  chain.select = () => {
    state.calls.select += 1;
    return chain;
  };
  chain.from = (table: unknown) => {
    state.recorded.push({ op: 'select', table });
    return chain;
  };
  chain.insert = write('insert');
  chain.update = write('update');
  chain.delete = write('delete');
  chain.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve(state.results.length > 0 ? state.results.shift() : whenEmpty).then(
      onFulfilled,
      onRejected,
    );
  chain.execute = () => {
    state.calls.execute += 1;
    return Promise.resolve([]);
  };
  chain.transaction = (work: (tx: unknown) => unknown) => {
    state.calls.transaction += 1;
    return work(chain);
  };

  const reset = () => {
    state.results = [];
    state.recorded.length = 0;
    Object.assign(state.calls, zeroCalls());
  };
  return { chain, state, reset };
}
