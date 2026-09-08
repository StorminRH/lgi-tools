import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runBrowserServices } from './browser-services.mjs';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), connect: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:net', () => ({ connect: mocks.connect }));

let root;
let children;
let signals;
let convexStarts;
let missingMarker;
let authExit;
let authConfigured;
let suiteExit;
let stubborn;
let reportStatus;

function finish(child, code) {
  child.exitCode = code;
  child.emit('exit', code, null);
}

function run() {
  return runBrowserServices({ root, readinessMs: 500, suiteMs: 500, stopMs: 200 });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  root = mkdtempSync(join(tmpdir(), 'lgi-ci-test-'));
  children = [];
  signals = [];
  convexStarts = 0;
  missingMarker = 0;
  authExit = 0;
  authConfigured = false;
  suiteExit = 0;
  stubborn = false;
  reportStatus = 'READY_FOR_REVIEW';
  for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_URL', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'LGI_DATABASE_URL', 'LGI_DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_MIGRATION_URL', 'DOTENV_PATH']) vi.stubEnv(key, '');
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
  vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
  mocks.connect.mockImplementation(() => {
    const socket = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() });
    queueMicrotask(() => socket.emit('error', { code: 'ECONNREFUSED' }));
    return socket;
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  mocks.spawn.mockImplementation((command, args, options) => {
    const child = Object.assign(new EventEmitter(), { pid: 60000 + children.length, exitCode: null, signalCode: null, alive: true, args, options });
    children.push(child);
    queueMicrotask(() => {
      if (args[0] === 'exec') {
        convexStarts += 1;
        const envFile = join(root, '.env.local');
        if (convexStarts === 1) writeFileSync(envFile, `${readFileSync(envFile, 'utf8')}CONVEX_DEPLOYMENT=anonymous:anonymous-agent\n`);
        mkdirSync(join(root, '.convex'), { recursive: true });
        if (authConfigured && args.includes('--start') && missingMarker !== convexStarts) writeFileSync(options.env.LGI_SCHEMA_READY_FILE, 'ready');
      } else if (command === process.execPath) {
        authConfigured = authExit === 0;
        finish(child, authExit);
      }
      else if (args[0] === 'test:e2e') {
        const captures = join(root, 'docs/ux-check/captures');
        mkdirSync(captures, { recursive: true });
        writeFileSync(join(captures, 'e2e-report.json'), JSON.stringify({ status: reportStatus, lane: 'mandatory-production' }));
        if (suiteExit !== null) finish(child, suiteExit);
      }
    });
    return child;
  });
  vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    const child = children.find((item) => item.pid === -pid);
    if (!child) throw new Error('Attempt to signal an unowned group');
    if (!child.alive) throw Object.assign(new Error('No group'), { code: 'ESRCH' });
    if (signal === 0) return true;
    signals.push([child.args[0], signal]);
    if (!stubborn || signal === 'SIGKILL') {
      child.alive = false;
      child.signalCode = signal;
      child.emit('exit', null, signal);
    }
    return true;
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('configures auth while initial schema is blocked, then gates Playwright on the restarted schema', async () => {
  const result = run();
  await vi.runAllTimersAsync();
  await result;
  expect(children.map((child) => child.args[0])).toEqual(['exec', 'start', '--input-type=module', 'exec', 'test:e2e']);
  const browser = children.at(-1);
  expect(browser.options.env.CONVEX_DEPLOYMENT).toBe('anonymous:anonymous-agent');
  expect(browser.options.env.DATABASE_URL).toBe('postgres://lgi:lgi@localhost:5433/lgi_tools');
  expect(browser.options.env.NEXT_PUBLIC_CONVEX_URL).toBe('http://127.0.0.1:3210');
  expect(browser.options.env.CONVEX_SERVICE_SECRET.length).toBeGreaterThanOrEqual(32);
  expect(children[2].options.env.CONVEX_SERVICE_SECRET).toBe(browser.options.env.CONVEX_SERVICE_SECRET);
  expect(children[0].args).not.toContain('--start');
  expect(children[0].options.env.LGI_SCHEMA_READY_FILE).toBeUndefined();
  expect(authConfigured).toBe(true);
  expect(children[3].args).toContain('--start');
  expect(children.every((child) => !child.alive)).toBe(true);
  expect(existsSync(join(root, '.convex'))).toBe(false);
  expect(existsSync(join(root, '.env.local'))).toBe(false);
  expect(signals.slice(0, 3)).toEqual([['--input-type=module', 'SIGTERM'], ['start', 'SIGTERM'], ['exec', 'SIGTERM']]);
});

test.each(['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_DEPLOYMENT', 'CONVEX_SELF_HOSTED_URL'])('rejects inherited %s before starting or deleting anything', async (key) => {
  vi.stubEnv(key, 'foreign-value');
  await expect(run()).rejects.toThrow(`${key} to be unset`);
  expect(mocks.spawn).not.toHaveBeenCalled();
});

test('refuses an existing deployment directory without deleting it', async () => {
  mkdirSync(join(root, '.convex'));
  await expect(run()).rejects.toThrow('.convex already exists');
  expect(existsSync(join(root, '.convex'))).toBe(true);
  expect(mocks.spawn).not.toHaveBeenCalled();
});

test('refuses occupied ports without starting or killing another service', async () => {
  mocks.connect.mockImplementation(() => {
    const socket = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() });
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  });
  const result = expect(run()).rejects.toThrow('already in use');
  await vi.runAllTimersAsync();
  await result;
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(process.kill).not.toHaveBeenCalled();
});

test('unreachable initial backend expires before auth and cleans its process', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false });
  const result = expect(run()).rejects.toThrow('Initial Convex backend: timed out');
  await vi.runAllTimersAsync();
  await result;
  expect(children).toHaveLength(1);
  expect(authConfigured).toBe(false);
  expect(children[0].alive).toBe(false);
});

test('missing post-auth schema readiness expires and never launches the browser', async () => {
  missingMarker = 2;
  const result = expect(run()).rejects.toThrow('Convex schema with live auth: timed out');
  await vi.runAllTimersAsync();
  await result;
  expect(children.some((child) => child.args[0] === 'test:e2e')).toBe(false);
  expect(authConfigured).toBe(true);
  expect(children.every((child) => !child.alive)).toBe(true);
});

test('auth failure blocks browser startup and cleans owned services', async () => {
  authExit = 1;
  const result = expect(run()).rejects.toThrow('Local Convex auth failed');
  await vi.runAllTimersAsync();
  await result;
  expect(children).toHaveLength(3);
  expect(children.every((child) => !child.alive)).toBe(true);
});

test.each([1, null])('browser failure or timeout (%s) stays failed and removes even exited parents with live descendants', async (code) => {
  suiteExit = code;
  stubborn = true;
  const result = expect(run()).rejects.toThrow(code === null ? 'timed out' : 'suite failed');
  await vi.runAllTimersAsync();
  await result;
  expect(children.every((child) => !child.alive)).toBe(true);
  expect(signals.filter(([, signal]) => signal === 'SIGKILL')).toHaveLength(children.length);
  expect(existsSync(join(root, '.convex'))).toBe(false);
});

test('a zero browser exit with blocked cleanup evidence fails', async () => {
  reportStatus = 'BLOCKED';
  const result = expect(run()).rejects.toThrow('evidence is missing or blocked');
  await vi.runAllTimersAsync();
  await result;
});

test('service death during a successful readiness probe cannot advance to auth', async () => {
  vi.mocked(fetch).mockImplementation(async () => { finish(children[0], 1); return { ok: true }; });
  const result = expect(run()).rejects.toThrow('owned service exited');
  await vi.runAllTimersAsync();
  await result;
  expect(children).toHaveLength(1);
  expect(children[0].alive).toBe(false);
});

test('SIGTERM interrupts readiness and still performs group cleanup', async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false });
  const result = expect(run()).rejects.toThrow('interrupted');
  await vi.advanceTimersByTimeAsync(100);
  process.emit('SIGTERM');
  await vi.runAllTimersAsync();
  await result;
  expect(children.every((child) => !child.alive)).toBe(true);
  expect(existsSync(join(root, '.env.local'))).toBe(false);
});
