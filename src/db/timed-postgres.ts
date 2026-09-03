import { addDependencyTiming } from '@/lib/dependency-timing';

const OBSERVED = Symbol('db.query-timed');

const LIFECYCLE_METHODS = new Set<string | symbol>(['end', 'listen', 'unlisten']);

type AnyFunction = (...args: unknown[]) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Times a postgres-js `Query` in place, preserving its laziness. A `Query` only runs when the
 * caller first calls `then`/`catch`/`finally`, so the timer starts there rather than at
 * construction; `Query.handle()` is guarded by its own `executed` flag and `Query.then` returns a
 * plain promise via `Symbol.species`, so observing the settlement cannot run the statement twice.
 * `catch` and `finally` are not patched because both delegate to `this.then`.
 */
function observeQuery<T>(value: T): T {
  if (!isThenable(value) || OBSERVED in (value as object)) return value;
  Object.defineProperty(value, OBSERVED, { value: true, enumerable: false });

  const query = value as unknown as { then: AnyFunction };
  const originalThen = query.then.bind(query) as AnyFunction;
  let observed = false;

  const begin = (): void => {
    if (observed) return;
    observed = true;
    const startedAt = performance.now();
    const record = (): void => {
      addDependencyTiming('neon', performance.now() - startedAt);
    };
    void originalThen(record, record);
  };

  query.then = (...args: unknown[]): unknown => {
    begin();
    return originalThen(...args);
  };
  return value;
}

function timedReserve(reserve: AnyFunction): AnyFunction {
  return async (...args: unknown[]): Promise<unknown> => {
    const startedAt = performance.now();
    const reserved = await reserve(...args);
    addDependencyTiming('neon', performance.now() - startedAt);
    return typeof reserved === 'object' || typeof reserved === 'function'
      ? withQueryTiming(reserved as object)
      : reserved;
  };
}

function timedTransaction(open: AnyFunction): AnyFunction {
  return (...args: unknown[]): unknown =>
    open(
      ...args.map((arg) =>
        typeof arg === 'function'
          ? (handle: object, ...rest: unknown[]) =>
              (arg as AnyFunction)(withQueryTiming(handle), ...rest)
          : arg,
      ),
    );
}

export function withQueryTiming<T extends object>(client: T): T {
  return new Proxy(client, {
    apply(target, thisArg, args) {
      return observeQuery(Reflect.apply(target as AnyFunction, thisArg, args));
    },
    get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const method = value.bind(target) as AnyFunction;
      if (LIFECYCLE_METHODS.has(prop)) return method;
      if (prop === 'reserve') return timedReserve(method);
      if (prop === 'begin' || prop === 'savepoint') return timedTransaction(method);
      return (...args: unknown[]): unknown => observeQuery(method(...args));
    },
  });
}
