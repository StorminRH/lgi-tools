import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureAuth } from './auth.mjs';

const children = new Set();
let stopping = false;
const directory = mkdtempSync(join(tmpdir(), 'lgi-ready-'));
const marker = join(directory, 'schema');

function start(args, env = process.env) {
  const child = spawn('pnpm', args, { stdio: 'inherit', detached: true, env });
  children.add(child);
  child.on('error', () => { child.failed = true; });
  child.on('exit', () => { children.delete(child); });
  return child;
}

function stop(child) {
  if (!children.has(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const deadline = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 10000);
    child.once('exit', () => { clearTimeout(deadline); resolve(); });
    try { process.kill(-child.pid, 'SIGTERM'); } catch { clearTimeout(deadline); resolve(); }
  });
}

async function waitFor(check, owned, label) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (stopping || owned.some((child) => child.failed || child.exitCode !== null || child.signalCode !== null)) throw new Error(`${label}: owned service exited`);
    const ready = await check();
    if (stopping || owned.some((child) => child.failed || child.exitCode !== null || child.signalCode !== null)) throw new Error(`${label}: owned service exited`);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready within 180 attempts`);
}

async function endpoint(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

async function cleanup() {
  stopping = true;
  await Promise.all([...children].map(stop));
  rmSync(directory, { recursive: true, force: true });
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup().then(() => process.exit(1)); });

try {
  if (await endpoint('http://localhost:3000/api/auth/jwks') || await endpoint('http://127.0.0.1:3210/version')) throw new Error('Stop existing Next/Convex services before starting the owned stack');
  const next = start(['dev', '--port', '3000']);
  const initialConvex = start(['exec', 'convex', 'dev']);
  await waitFor(async () => await endpoint('http://localhost:3000/api/auth/jwks') && await endpoint('http://127.0.0.1:3210/version'), [next, initialConvex], 'Next and local Convex');
  await configureAuth();
  await stop(initialConvex);
  const convex = start(['exec', 'convex', 'dev', '--start', 'node scripts/dev/schema-ready.mjs'], { ...process.env, LGI_SCHEMA_READY_FILE: marker });
  await waitFor(async () => existsSync(marker), [next, convex], 'Convex schema with live auth');
  console.log('LGI stack ready: local PostgreSQL, Next JWKS, Convex auth environment and schema verified.');
  if (!process.argv.includes('--once')) await new Promise((resolve, reject) => {
    for (const child of [next, convex]) child.once('exit', () => reject(new Error('Owned development service exited')));
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
