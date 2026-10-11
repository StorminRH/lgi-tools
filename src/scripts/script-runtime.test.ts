import { afterEach, expect, test, vi } from 'vitest';
import { PG_CONNECT_TIMEOUT_SECONDS, type Sql } from '@/db';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const { postgresMock, builtClient } = vi.hoisted(() => {
  const builtClient = { end: () => Promise.resolve() };
  return { postgresMock: vi.fn((..._args: unknown[]) => builtClient), builtClient };
});

vi.mock('postgres', () => ({ default: postgresMock }));

import { createScriptClient, requireSoftFailLockClient, runScript } from './script-runtime';

class ExitSignal extends Error {
  constructor(readonly code: unknown) {
    super(`process.exit(${String(code)})`);
  }
}

/** process.exit that stops the caller, as the real one does. */
function stopOnExit() {
  return vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitSignal(code);
  });
}

/** process.exit that returns, so runScript's promise chain can be observed to the end. */
function recordExit() {
  return vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
}

function endableClient() {
  const end = vi.fn(() => Promise.resolve());
  return { end, client: { end } as unknown as Sql };
}

function stubDatabaseEnv(urls: { DATABASE_URL?: string; DATABASE_URL_UNPOOLED?: string }) {
  vi.stubEnv('LGI_DATABASE_URL', '');
  vi.stubEnv('LGI_DATABASE_URL_UNPOOLED', '');
  vi.stubEnv('DATABASE_URL', urls.DATABASE_URL ?? '');
  vi.stubEnv('DATABASE_URL_UNPOOLED', urls.DATABASE_URL_UNPOOLED ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  postgresMock.mockClear();
});

test('createScriptClient hands postgres the caller URL and pool size with the shared connect bound', () => {
  const client = createScriptClient('postgres://lgi@db.example/lgi', { max: 5 });

  expect(client).toBe(builtClient);
  expect(postgresMock).toHaveBeenCalledExactlyOnceWith('postgres://lgi@db.example/lgi', {
    max: 5,
    connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
  });
});

test('requireSoftFailLockClient builds a two-connection client on the unpooled URL', () => {
  stubDatabaseEnv({
    DATABASE_URL: 'postgres://lgi@ep-app-pooler.example/lgi',
    DATABASE_URL_UNPOOLED: 'postgres://lgi@ep-app.example/lgi',
  });

  const client = requireSoftFailLockClient('Skipping (DATABASE_URL is not set).', 'Skipping:');

  expect(client).toBe(builtClient);
  expect(postgresMock).toHaveBeenCalledExactlyOnceWith('postgres://lgi@ep-app.example/lgi', {
    max: 2,
    connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
  });
});

test('requireSoftFailLockClient exits 0 with its message when no database URL is set', () => {
  stubDatabaseEnv({});
  const log = silenceConsolePrefixes('log', ['Skipping auto-step']);
  const exit = stopOnExit();

  expect(() =>
    requireSoftFailLockClient('Skipping auto-step (DATABASE_URL is not set).', 'Skipping auto-step:'),
  ).toThrow(ExitSignal);

  expect(log).toHaveBeenCalledExactlyOnceWith('Skipping auto-step (DATABASE_URL is not set).');
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(postgresMock).not.toHaveBeenCalled();
});

test('requireSoftFailLockClient exits 0 with its prefix when the only URL is pooled', () => {
  stubDatabaseEnv({ DATABASE_URL: 'postgres://lgi@ep-app-pooler.example/lgi' });
  const error = silenceConsolePrefixes('error', ['Skipping auto-step']);
  const exit = stopOnExit();

  expect(() =>
    requireSoftFailLockClient('Skipping auto-step (DATABASE_URL is not set).', 'Skipping auto-step:'),
  ).toThrow(ExitSignal);

  expect(error).toHaveBeenCalledExactlyOnceWith('Skipping auto-step:', expect.any(Error));
  expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(postgresMock).not.toHaveBeenCalled();
});

test('runScript ends the client before exiting 0 when main resolves', async () => {
  const exit = recordExit();
  const { end, client } = endableClient();

  runScript(() => Promise.resolve(), { client });

  await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(0));
  expect(end).toHaveBeenCalledOnce();
  expect(end.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]!);
});

test('runScript logs a failure, ends the client and exits 1, or 0 under softFail', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const exit = recordExit();
  const failure = new Error('ingest failed');
  const hard = endableClient();

  runScript(() => Promise.reject(failure), { client: hard.client });

  await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(1));
  expect(error).toHaveBeenCalledExactlyOnceWith(failure);
  expect(hard.end).toHaveBeenCalledOnce();

  exit.mockClear();
  const soft = endableClient();
  soft.end.mockRejectedValueOnce(new Error('already closed'));

  runScript(() => Promise.reject(failure), { client: soft.client, softFail: true });

  await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(0));
  expect(soft.end).toHaveBeenCalledOnce();
});

test('runScript without a client exits 0 on success and 1 on failure', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const exit = recordExit();

  runScript(() => Promise.resolve());

  await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(0));

  exit.mockClear();
  const failure = new Error('warm failed');

  runScript(() => Promise.reject(failure));

  await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(1));
  expect(error).toHaveBeenCalledExactlyOnceWith(failure);
});
