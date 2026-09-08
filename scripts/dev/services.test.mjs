import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), exists: vi.fn(), remove: vi.fn(), auth: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs', () => ({ mkdtempSync: () => '/tmp/lgi-owned-test', existsSync: mocks.exists, rmSync: mocks.remove }));
vi.mock('./auth.mjs', () => ({ configureAuth: mocks.auth }));

let children;
let kill;
let fetchMock;
let originalExitCode;
let originalArgv;
let signalListeners;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  originalExitCode = process.exitCode;
  originalArgv = process.argv;
  process.exitCode = undefined;
  process.argv = [...process.argv, '--once'];
  signalListeners = new Map(['SIGINT', 'SIGTERM'].map((signal) => [signal, process.listeners(signal)]));
  children = [];
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { pid: 40000 + children.length, exitCode: null, signalCode: null });
    children.push(child);
    return child;
  });
  kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    const child = children.find((candidate) => candidate.pid === -pid);
    if (!child) throw new Error('Attempted to stop an unowned process');
    child.signalCode = signal;
    child.emit('exit', null, signal);
    return true;
  });
  fetchMock = vi.fn().mockImplementation(async () => ({ ok: children.length > 0 }));
  vi.stubGlobal('fetch', fetchMock);
  mocks.exists.mockReturnValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const [signal, previous] of signalListeners) {
    for (const listener of process.listeners(signal)) if (!previous.includes(listener)) process.removeListener(signal, listener);
  }
  process.exitCode = originalExitCode;
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('restarts owned Convex after auth, waits for its schema marker, then stops only owned groups', async () => {
  mocks.exists.mockReturnValue(false);
  const running = import('./services.mjs');
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(3));
  expect(console.log).not.toHaveBeenCalled();
  expect(mocks.auth).toHaveBeenCalledOnce();
  expect(kill.mock.calls).toEqual([[-40001, 'SIGTERM']]);
  expect(mocks.spawn.mock.calls[2]).toEqual(['pnpm', ['exec', 'convex', 'dev', '--start', 'node scripts/dev/schema-ready.mjs'], {
    stdio: 'inherit', detached: true, env: { ...process.env, LGI_SCHEMA_READY_FILE: '/tmp/lgi-owned-test/schema' },
  }]);
  mocks.exists.mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(1000);
  await running;
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('LGI stack ready'));
  expect(kill.mock.calls).toEqual([[-40001, 'SIGTERM'], [-40000, 'SIGTERM'], [-40002, 'SIGTERM']]);
  expect(mocks.remove).toHaveBeenCalledWith('/tmp/lgi-owned-test', { recursive: true, force: true });
  expect(process.exitCode).toBeUndefined();
});

test('existing healthy services are refused without starting or killing processes', async () => {
  fetchMock.mockResolvedValue({ ok: true });
  await import('./services.mjs');
  expect(process.exitCode).toBe(1);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(kill).not.toHaveBeenCalled();
  expect(mocks.auth).not.toHaveBeenCalled();
});

test('an owned child exiting during a successful readiness probe cannot report ready', async () => {
  fetchMock.mockImplementation(async () => {
    if (children.length === 0) return { ok: false };
    children[0].exitCode = 1;
    children[0].emit('exit', 1, null);
    return { ok: true };
  });
  await import('./services.mjs');
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledWith('Next and local Convex: owned service exited');
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
  expect(kill.mock.calls).toEqual([[-40001, 'SIGTERM']]);
});

test('missing schema readiness expires and cleans up without reporting success', async () => {
  mocks.exists.mockReturnValue(false);
  const running = import('./services.mjs');
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(3));
  await vi.advanceTimersByTimeAsync(180000);
  await running;
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledWith('Convex schema with live auth did not become ready within 180 attempts');
  expect(console.log).not.toHaveBeenCalled();
  expect(kill.mock.calls).toHaveLength(3);
});

test('unreachable endpoints expire before auth setup and clean up both owned services', async () => {
  fetchMock.mockRejectedValue(new Error('connection refused'));
  const running = import('./services.mjs');
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(2));
  await vi.advanceTimersByTimeAsync(180000);
  await running;
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledWith('Next and local Convex did not become ready within 180 attempts');
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(kill.mock.calls).toEqual([[-40000, 'SIGTERM'], [-40001, 'SIGTERM']]);
});
