// Bounded `/sites` development profiler, reused by session 3.9.3.4.2.
//
// Run: pnpm --silent profile:sites-dev --label <label>
// Labels: as-found, clean, after, sample (grammar: ^[a-z0-9-]{1,32}$).
//
// Stdout is exactly one JSON document on every exit path. Child-server output
// and diagnostics go to stderr. The same JSON is written under
// docs/ux-check/profiles/. Exit codes: 0 ok, 1 aborted, 2 refused.
//
// The child runs in its own process group. Every normal, signal, exception, and
// rejection path uses the same idempotent teardown: SIGTERM, a bounded ten-second
// poll, SIGKILL if needed, then a port-3000 closure check. SIGKILL of this
// profiler itself is the one unhandleable cleanup case.

import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  PROFILE_THRESHOLDS,
  buildCatalogueModeEvidence,
  countDetailSentinels,
  evaluateAbort,
  extractCardCount,
  extractDevSampleMarker,
  isClaimableDevLog,
  isLocalDatabaseTarget,
  isValidProfileLabel,
  parseDatabaseTarget,
  parseDevRequestLine,
  parseMemoryPressure,
  parseProfileArgs,
  parsePsGroup,
  parseSwapUsage,
  parseVmStat,
  profileReason,
  resolveProfileOutcome,
  selectPreflightRefusal,
  shapeProfileResult,
  summarisePhaseSamples,
} from './profile-parse.mjs';

const ROOT = process.cwd();
const BASE_URL = 'http://localhost:3000';
const PROFILE_DIR = path.join(ROOT, 'docs/ux-check/profiles');
const SAMPLE_INTERVAL_MS = 500;
const SWAP_INTERVAL_MS = 5000;
const READY_TIMEOUT_MS = 180_000;
const IDLE_WINDOW_MS = 30_000;
const LOG_WAIT_MS = 10_000;
const TERMINATE_WAIT_MS = 10_000;

const runtime = {
  label: 'refused',
  startedAt: new Date().toISOString(),
  startMs: performance.now(),
  phase: 'preflight',
  child: null,
  pgid: null,
  childExit: null,
  readyAtMs: null,
  devLogs: [],
  samples: [],
  controllers: new Set(),
  sampler: null,
  sampling: false,
  lastSwapUsedBytes: null,
  lastSwapSampleMs: -Infinity,
  startSwapBytes: null,
  externalAbort: null,
  teardown: null,
  teardownPromise: null,
  preconditions: {},
  measurements: {},
  finishPromise: null,
};

class ProfileStop extends Error {
  constructor(reason) {
    super(reason.message);
    this.name = 'ProfileStop';
    this.reason = reason;
  }
}

const elapsedMs = () => Math.round((performance.now() - runtime.startMs) * 1000) / 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const diagnostic = (message) => process.stderr.write(`${message}\n`);

const reason = profileReason;

function runSync(command, args) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
}

function timestampSlug(iso) {
  return iso.replace(/[-:.]/g, '');
}

function outputPathFor(label, finishedAt) {
  const safeLabel = isValidProfileLabel(label) ? label : 'refused';
  return path.join(PROFILE_DIR, `${safeLabel}-${timestampSlug(finishedAt)}.json`);
}

function portListeners() {
  const check = runSync('lsof', ['-nP', '-iTCP:3000', '-sTCP:LISTEN']);
  if (check.status === 1) return [];
  if (check.status === 0) return check.stdout.split('\n').filter(Boolean);
  return [{ error: commandFailure(check, 'lsof failed') }];
}

function commandFailure(result, fallback) {
  return String(result.stderr || result.stdout || fallback).trim();
}

function tcpReachable(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function databaseTarget() {
  loadDotenv({ path: path.join(ROOT, '.env.local'), quiet: true });
  return parseDatabaseTarget(process.env.DATABASE_URL, process.env.LOCAL_DB_DRIVER);
}

function memorySnapshot() {
  const pressureRun = runSync('memory_pressure', ['-Q']);
  const vmRun = runSync('vm_stat', []);
  const swapRun = runSync('sysctl', ['vm.swapusage']);
  return {
    commandsOk: pressureRun.status === 0 && vmRun.status === 0 && swapRun.status === 0,
    pressure: parseMemoryPressure(pressureRun.stdout),
    vm: parseVmStat(vmRun.stdout),
    swap: parseSwapUsage(swapRun.stdout),
    errors: [pressureRun, vmRun, swapRun]
      .filter((result) => result.status !== 0)
      .map((result) => (result.stderr || result.stdout || 'memory command failed').trim()),
  };
}

function directorySizeBytes(directory) {
  const result = runSync('du', ['-sk', directory]);
  if (result.status !== 0) return 0;
  const kib = Number(result.stdout.trim().split(/\s+/)[0]);
  return Number.isFinite(kib) ? kib * 1024 : 0;
}

async function nextVersion() {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  return pkg.dependencies?.next ?? null;
}

async function preflight() {
  const listeners = portListeners();
  const db = databaseTarget();
  const databaseReachable = isLocalDatabaseTarget(db) ? await tcpReachable(db.host, db.port) : false;
  const memory = memorySnapshot();
  runtime.startSwapBytes = memory.swap.usedBytes;
  runtime.lastSwapUsedBytes = memory.swap.usedBytes;
  runtime.preconditions = {
    platform: process.platform,
    nodeVersion: process.version,
    nextVersion: await nextVersion(),
    nextDirectoryBytes: directorySizeBytes(path.join(ROOT, '.next')),
    port3000Listeners: listeners,
    database: db ? { ...db, reachable: databaseReachable } : { reachable: false },
    memory,
    thresholds: PROFILE_THRESHOLDS,
  };
  return selectPreflightRefusal({ listeners, database: db, databaseReachable, memory });
}

function requestAbort(stopReason) {
  runtime.externalAbort ??= stopReason;
  for (const controller of runtime.controllers) controller.abort();
}

function throwIfStopped() {
  if (runtime.externalAbort) throw new ProfileStop(runtime.externalAbort);
}

async function waitWithAbort(ms) {
  const deadline = performance.now() + ms;
  while (performance.now() < deadline) {
    throwIfStopped();
    await wait(Math.min(250, deadline - performance.now()));
  }
  throwIfStopped();
}

function processGroupExists() {
  if (!runtime.pgid) return false;
  try {
    process.kill(-runtime.pgid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function signalProcessGroup(signal) {
  if (!runtime.pgid || !processGroupExists()) return false;
  try {
    process.kill(-runtime.pgid, signal);
    return true;
  } catch {
    return false;
  }
}

function createTeardownResult() {
  return {
    pgid: runtime.pgid,
    sigtermSent: false,
    sigkillSent: false,
    groupGone: runtime.pgid === null,
    port3000Closed: runtime.pgid === null ? null : false,
    errors: [],
    durationMs: 0,
  };
}

async function waitForProcessGroupExit(timeoutMs, pollMs) {
  const deadline = performance.now() + timeoutMs;
  while (processGroupExists() && performance.now() < deadline) await wait(pollMs);
  return !processGroupExists();
}

async function terminateProcessGroup(result) {
  result.sigtermSent = signalProcessGroup('SIGTERM');
  if (await waitForProcessGroupExit(TERMINATE_WAIT_MS, 250)) return;
  result.sigkillSent = signalProcessGroup('SIGKILL');
  await waitForProcessGroupExit(2000, 100);
}

function recordTeardownState(result) {
  result.groupGone = !processGroupExists();
  if (runtime.pgid !== null) result.port3000Closed = portListeners().length === 0;
  if (!result.groupGone) result.errors.push('process group still exists after SIGKILL');
  if (result.port3000Closed === false) {
    result.errors.push('port 3000 is still listening after teardown');
  }
}

async function performProcessGroupCleanup() {
  const startedAtMs = elapsedMs();
  const result = createTeardownResult();
  if (runtime.sampler) clearInterval(runtime.sampler);
  runtime.sampler = null;
  await terminateProcessGroup(result);
  recordTeardownState(result);
  result.durationMs = elapsedMs() - startedAtMs;
  runtime.teardown = result;
  return result;
}

async function cleanupProcessGroup() {
  if (!runtime.teardownPromise) runtime.teardownPromise = performProcessGroupCleanup();
  return runtime.teardownPromise;
}

function captureChildLines(stream, source) {
  const lines = createInterface({ input: stream });
  lines.on('line', (line) => {
    diagnostic(`[next:${source}] ${line}`);
    if (runtime.readyAtMs === null && /(?:✓|✔)?\s*Ready in\s+/i.test(line)) {
      runtime.readyAtMs = elapsedMs();
    }
    const parsed = parseDevRequestLine(line);
    if (parsed) runtime.devLogs.push({ ...parsed, atMs: elapsedMs(), claimed: false });
  });
}

function spawnDevServer() {
  runtime.phase = 'startup';
  const child = spawn('pnpm', ['exec', 'next', 'dev', '-H', '127.0.0.1', '-p', '3000'], {
    cwd: ROOT,
    detached: true,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runtime.child = child;
  runtime.pgid = child.pid;
  captureChildLines(child.stdout, 'stdout');
  captureChildLines(child.stderr, 'stderr');
  child.once('exit', (code, signal) => {
    runtime.childExit = { code, signal, atMs: elapsedMs() };
    if (runtime.phase !== 'teardown' && runtime.phase !== 'complete') {
      requestAbort(reason('dev-server-exit', 'Next dev exited before profiling completed', {
        code,
        signal,
      }));
    }
  });
}

function sampleProcessGroup() {
  if (!runtime.pgid) return parsePsGroup('');
  const result = runSync('ps', ['-g', String(runtime.pgid), '-o', 'pid=,rss=,pcpu=,comm=']);
  return result.status === 0 ? parsePsGroup(result.stdout) : parsePsGroup('');
}

function sampleSwap(atMs) {
  if (atMs - runtime.lastSwapSampleMs < SWAP_INTERVAL_MS) return runtime.lastSwapUsedBytes;
  runtime.lastSwapSampleMs = atMs;
  const result = runSync('sysctl', ['vm.swapusage']);
  const usedBytes = result.status === 0 ? parseSwapUsage(result.stdout).usedBytes : null;
  if (Number.isFinite(usedBytes)) runtime.lastSwapUsedBytes = usedBytes;
  return usedBytes;
}

function samplingBlocked() {
  return runtime.sampling || ['teardown', 'complete'].includes(runtime.phase);
}

function collectCurrentSample() {
  const atMs = elapsedMs();
  const group = sampleProcessGroup();
  return {
    atMs,
    phase: runtime.phase,
    totalRssBytes: group.totalRssBytes,
    totalCpuPercent: group.totalCpuPercent,
    nextServerProcesses: group.nextServerProcesses,
    processCount: group.processes.length,
    swapUsedBytes: sampleSwap(atMs),
  };
}

function applySampleAbortVerdict() {
  const stopReason = evaluateAbort(runtime.samples, runtime.startSwapBytes);
  if (stopReason) requestAbort(stopReason);
}

function takeSample() {
  if (samplingBlocked()) return;
  runtime.sampling = true;
  try {
    runtime.samples.push(collectCurrentSample());
    applySampleAbortVerdict();
  } finally {
    runtime.sampling = false;
  }
}

function startSampler() {
  takeSample();
  runtime.sampler = setInterval(takeSample, SAMPLE_INTERVAL_MS);
}

async function waitForReady() {
  const deadline = performance.now() + READY_TIMEOUT_MS;
  while (runtime.readyAtMs === null) {
    throwIfStopped();
    if (performance.now() >= deadline) {
      throw new ProfileStop(reason('ready-timeout', 'Next dev did not become Ready within 180 seconds'));
    }
    await wait(100);
  }
}

async function claimDevLog(route, requestStartedAtMs, drainedAtMs) {
  const deadline = performance.now() + LOG_WAIT_MS;
  while (performance.now() < deadline) {
    throwIfStopped();
    const match = runtime.devLogs.find((entry) => isClaimableDevLog(entry, {
      route,
      requestStartedAtMs,
      drainedAtMs,
      baseUrl: BASE_URL,
      logWaitMs: LOG_WAIT_MS,
    }));
    if (match) {
      match.claimed = true;
      const { claimed: _claimed, ...publicEntry } = match;
      return publicEntry;
    }
    await wait(100);
  }
  throw new ProfileStop(reason('missing-dev-log', `no correlated Next dev log line arrived for ${route}`));
}

function requireSuccessfulResponse(response, name, route) {
  if (response.status >= 200 && response.status < 300) return;
  throw new ProfileStop(reason('http-status', `${name} returned HTTP ${response.status}`, {
    route,
    status: response.status,
  }));
}

function requestFailure(error, { name, route, timeoutMs, timedOut }) {
  if (error instanceof ProfileStop) return error;
  if (runtime.externalAbort) return new ProfileStop(runtime.externalAbort);
  if (timedOut) {
    return new ProfileStop(reason('request-timeout', `${name} exceeded ${timeoutMs}ms`, { route }));
  }
  return new ProfileStop(reason('request-failed', `${name} failed`, {
    route,
    error: errorMessage(error),
  }));
}

async function measureRequest(name, route, timeoutMs) {
  const controller = new AbortController();
  runtime.controllers.add(controller);
  const startedAtMs = elapsedMs();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(new URL(route, BASE_URL), { signal: controller.signal });
    const body = await response.text();
    const drainedAtMs = elapsedMs();
    requireSuccessfulResponse(response, name, route);
    const devLog = await claimDevLog(route, startedAtMs, drainedAtMs);
    return {
      name,
      route,
      status: response.status,
      startedAtMs,
      drainedAtMs,
      durationMs: drainedAtMs - startedAtMs,
      bodyBytes: Buffer.byteLength(body),
      sentinels: countDetailSentinels(body),
      cardCount: extractCardCount(body),
      devSampleMarker: extractDevSampleMarker(body),
      devLog,
    };
  } catch (error) {
    throw requestFailure(error, { name, route, timeoutMs, timedOut });
  } finally {
    clearTimeout(timeout);
    runtime.controllers.delete(controller);
  }
}

async function runMeasurements() {
  runtime.phase = 'idle';
  await waitWithAbort(IDLE_WINDOW_MS);
  runtime.measurements.idle = {
    durationMs: IDLE_WINDOW_MS,
    ...summarisePhaseSamples(runtime.samples, 'idle'),
  };

  runtime.phase = 'prewarm';
  runtime.measurements.prewarm = await measureRequest('prewarm-home', '/', 60_000);

  runtime.phase = 'cold-sites';
  let coldSettled = false;
  const coldPromise = measureRequest('cold-sites', '/sites', 120_000)
    .finally(() => { coldSettled = true; });
  coldPromise.catch(() => {});
  await waitWithAbort(750);
  if (coldSettled) {
    runtime.measurements.responsiveness = { verdict: 'not-overlapped', launchedAtMs: null };
  } else {
    const launchedAtMs = elapsedMs();
    const control = await measureRequest('responsiveness-home', '/', 15_000);
    runtime.measurements.responsiveness = { verdict: 'passed', launchedAtMs, request: control };
  }
  runtime.measurements.coldSites = await coldPromise;

  runtime.phase = 'warm-sites-1';
  const warmOne = await measureRequest('warm-sites-1', '/sites', 30_000);
  runtime.phase = 'warm-sites-2';
  const warmTwo = await measureRequest('warm-sites-2', '/sites', 30_000);
  runtime.measurements.warmSites = [warmOne, warmTwo];
}

function resultDetails(outputFile) {
  const numericRss = runtime.samples.map((sample) => sample.totalRssBytes).filter(Number.isFinite);
  const numericCpu = runtime.samples.map((sample) => sample.totalCpuPercent).filter(Number.isFinite);
  const modeEvidence = buildCatalogueModeEvidence(runtime.measurements.coldSites, {
    sampleEnv: process.env.LGI_SITES_SAMPLE === '1',
  });
  return {
    outputFile: path.relative(ROOT, outputFile),
    ...modeEvidence,
    preconditions: runtime.preconditions,
    process: {
      pgid: runtime.pgid,
      readyAtMs: runtime.readyAtMs,
      childExit: runtime.childExit,
      peakRssBytes: numericRss.length ? Math.max(...numericRss) : null,
      peakCpuPercent: numericCpu.length ? Math.max(...numericCpu) : null,
      teardown: runtime.teardown,
    },
    measurements: runtime.measurements,
    samples: runtime.samples,
  };
}

function buildResult({ status, stopReason, finishedAt, outputFile }) {
  return shapeProfileResult({
    label: runtime.label,
    status,
    reason: stopReason,
    startedAt: runtime.startedAt,
    finishedAt,
    details: resultDetails(outputFile),
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function persistResult(result, outputFile, finishedAt) {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  try {
    await mkdir(PROFILE_DIR, { recursive: true });
    await writeFile(outputFile, json, 'utf8');
    return { result, json };
  } catch (error) {
    const failed = buildResult({
      status: 'aborted',
      stopReason: reason('output-write-failed', 'profile JSON could not be written to disk', {
        error: errorMessage(error),
      }),
      finishedAt,
      outputFile,
    });
    return { result: failed, json: `${JSON.stringify(failed, null, 2)}\n` };
  }
}

async function performFinish(status, stopReason) {
  runtime.phase = 'teardown';
  const teardown = await cleanupProcessGroup();
  runtime.phase = 'complete';
  const finishedAt = new Date().toISOString();
  const outputFile = outputPathFor(runtime.label, finishedAt);
  const outcome = resolveProfileOutcome(status, stopReason, teardown.errors);
  const initial = buildResult({
    status: outcome.status,
    stopReason: outcome.reason,
    finishedAt,
    outputFile,
  });
  const persisted = await persistResult(initial, outputFile, finishedAt);
  process.stdout.write(persisted.json);
  process.exitCode = persisted.result.exitCode;
  return persisted.result;
}

async function finish(status, stopReason) {
  if (!runtime.finishPromise) runtime.finishPromise = performFinish(status, stopReason);
  return runtime.finishPromise;
}

async function main() {
  const args = parseProfileArgs(process.argv.slice(2));
  runtime.label = isValidProfileLabel(args.label) ? args.label : 'refused';
  if (args.refusal) return finish('refused', args.refusal);
  const preflightRefusal = await preflight();
  if (preflightRefusal) return finish('refused', preflightRefusal);
  spawnDevServer();
  startSampler();
  await waitForReady();
  await runMeasurements();
  return finish('ok', null);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    requestAbort(reason('signal', `profiling interrupted by ${signal}`, { signal }));
    void cleanupProcessGroup();
  });
}

process.on('uncaughtException', (error) => {
  const stopReason = reason('uncaught-exception', 'profiler hit an uncaught exception', {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  requestAbort(stopReason);
  void finish('aborted', stopReason);
});

process.on('unhandledRejection', (error) => {
  const stopReason = reason('unhandled-rejection', 'profiler hit an unhandled rejection', {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  requestAbort(stopReason);
  void finish('aborted', stopReason);
});

try {
  await main();
} catch (error) {
  const stopReason = error instanceof ProfileStop
    ? error.reason
    : reason('profiler-error', 'profiler failed unexpectedly', {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  await finish('aborted', stopReason);
}
