import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { localProcessEnvironment, prepareEnvironment } from '../dev/environment.mjs';

const pause = () => new Promise((done) => setTimeout(done, 100));

async function requireUnusedPort(port) {
  await new Promise((done, reject) => {
    const socket = connect({ host: 'localhost', port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); reject(new Error(`Port ${port} is already in use`)); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Port ${port} could not be checked`)); });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') done();
      else reject(new Error(`Port ${port} could not be checked`));
    });
  });
}

export async function runBrowserServices({ root = process.cwd(), readinessMs = 180000, suiteMs = 1200000, stopMs = 5000 } = {}) {
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local', '.convex', 'docs/ux-check/captures/e2e-report.json']) {
    if (existsSync(join(root, name))) throw new Error(`Disposable CI checkout required: ${name} already exists`);
  }
  for (const key of ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN', 'CONVEX_URL', 'CONVEX_SELF_HOSTED_URL', 'CONVEX_SELF_HOSTED_ADMIN_KEY']) {
    if (process.env[key]) throw new Error(`Disposable CI checkout requires ${key} to be unset`);
  }
  if (process.env.NEXT_PUBLIC_CONVEX_URL !== 'http://127.0.0.1:3210') throw new Error('Build and browser must use http://127.0.0.1:3210');
  for (const port of [3000, 3210, 3211]) await requireUnusedPort(port);

  const directory = mkdtempSync(join(tmpdir(), 'lgi-ci-browser-'));
  const marker = join(directory, 'schema');
  const groups = new Set();
  let interrupted = false;
  let prepared = false;
  const interrupt = () => { interrupted = true; };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, interrupt);

  function start(command, args, env) {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', detached: true });
    groups.add(child);
    child.on('error', () => { child.failed = true; });
    return child;
  }

  function exited(child) {
    return child.failed || child.exitCode !== null || child.signalCode !== null;
  }

  async function waitFor(check, owned, label, timeout = readinessMs) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (interrupted || owned.some(exited)) throw new Error(`${label}: interrupted or owned service exited`);
      const ready = await check();
      if (interrupted || owned.some(exited)) throw new Error(`${label}: interrupted or owned service exited`);
      if (ready) return;
      await pause();
    }
    throw new Error(`${label}: timed out`);
  }

  function signalGroup(child, signal) {
    if (!child.pid) return false;
    try { process.kill(-child.pid, signal); return true; } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  }

  async function stop(child) {
    signalGroup(child, 'SIGTERM');
    const deadline = Date.now() + stopMs;
    while (signalGroup(child, 0) && Date.now() < deadline) await pause();
    if (signalGroup(child, 0)) {
      signalGroup(child, 'SIGKILL');
      const killedDeadline = Date.now() + stopMs;
      while (signalGroup(child, 0) && Date.now() < killedDeadline) await pause();
      if (signalGroup(child, 0)) throw new Error('Owned process group did not stop after SIGKILL');
    }
    groups.delete(child);
  }

  async function endpoint(url) {
    try { return (await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' })).ok; } catch { return false; }
  }

  try {
    prepareEnvironment(root);
    prepared = true;
    const env = localProcessEnvironment(root);
    const convexArgs = ['exec', 'convex', 'dev', '--local-cloud-port', '3210', '--local-site-port', '3211',
      '--codegen', 'disable', '--typecheck', 'disable', '--tail-logs', 'disable', '--start', 'node scripts/dev/schema-ready.mjs'];
    const initial = start('pnpm', convexArgs, { ...env, LGI_SCHEMA_READY_FILE: marker });
    await waitFor(async () => existsSync(marker) && await endpoint('http://127.0.0.1:3210/version'), [initial], 'Initial Convex schema');
    const deployment = parseEnv(readFileSync(join(root, '.env.local'), 'utf8')).CONVEX_DEPLOYMENT;
    if (!/^anonymous:anonymous-[a-zA-Z0-9_-]+$/.test(deployment ?? '')) throw new Error('Convex did not select an anonymous deployment');
    env.CONVEX_DEPLOYMENT = deployment;
    const next = start('pnpm', ['start', '--port', '3000'], env);
    await waitFor(() => endpoint('http://localhost:3000/api/auth/jwks'), [initial, next], 'Production JWKS');
    const auth = start(process.execPath, ['--input-type=module', '-e', 'import { configureAuth } from "./scripts/dev/auth.mjs"; await configureAuth();'], env);
    await waitFor(() => exited(auth), [initial, next], 'Local Convex auth');
    if (auth.exitCode !== 0) throw new Error('Local Convex auth failed');
    await stop(auth);
    await stop(next);
    await stop(initial);
    rmSync(marker, { force: true });
    const convex = start('pnpm', convexArgs, { ...env, LGI_SCHEMA_READY_FILE: marker });
    await waitFor(async () => existsSync(marker) && await endpoint('http://127.0.0.1:3210/version'), [convex], 'Convex schema with live auth');
    await requireUnusedPort(3000);
    const suite = start('pnpm', ['test:e2e'], env);
    await waitFor(() => exited(suite), [convex], 'Mandatory production browser suite', suiteMs);
    if (suite.exitCode !== 0) throw new Error('Mandatory production browser suite failed');
    const report = JSON.parse(readFileSync(join(root, 'docs/ux-check/captures/e2e-report.json'), 'utf8'));
    if (report.status !== 'READY_FOR_REVIEW' || report.lane !== 'mandatory-production') throw new Error('Mandatory production browser evidence is missing or blocked');
  } finally {
    const stopped = await Promise.allSettled([...groups].map(stop));
    for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, interrupt);
    rmSync(directory, { recursive: true, force: true });
    if (prepared && stopped.every((result) => result.status === 'fulfilled')) {
      rmSync(join(root, '.env.local'), { force: true });
      rmSync(join(root, '.convex'), { recursive: true, force: true });
    }
    if (stopped.some((result) => result.status === 'rejected')) throw new Error('Owned browser services could not be stopped');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runBrowserServices(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
