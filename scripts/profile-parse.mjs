// Pure, import-safe parsing and policy helpers for profile-sites-dev.mjs.
// The entry script owns process lifecycle and I/O; this module owns the
// machine-readable formats and abort verdicts so their boundaries stay tested.

const KIB = 1024;
const MIB = KIB ** 2;
const GIB = KIB ** 3;
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const LABEL_PATTERN = /^[a-z0-9-]{1,32}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const PROFILE_THRESHOLDS = Object.freeze({
  maxSwapGrowthBytes: GIB,
  maxRssBytes: 4.5 * GIB,
  idleCpuPercent: 800,
  idleCpuSustainMs: 20_000,
  minFreeInactiveBytes: 6 * GIB,
  minMemoryPressureFreePercent: 10,
});

export function profileReason(code, message, details = {}) {
  return { code, message, ...details };
}

function parseFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseByteSize(raw) {
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)([KMGT])?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? '').toUpperCase();
  const multiplier = { '': 1, K: KIB, M: MIB, G: GIB, T: GIB * KIB }[unit];
  return Number.isFinite(value) && multiplier !== undefined ? value * multiplier : null;
}

export function parseDurationMs(raw) {
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)(µs|ms|s|min)$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier = { 'µs': 0.001, ms: 1, s: 1000, min: 60_000 }[match[2]];
  return value * multiplier;
}

export function parseDevRequestLine(line) {
  const raw = String(line).replace(ANSI_PATTERN, '');
  const match = raw.match(/^\s*(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+(\S+)\s+(\d{3})\s+in\s+(\d+(?:\.\d+)?(?:µs|ms|s|min))(?:\s+\((.+)\))?\s*$/);
  if (!match) return null;
  const durationMs = parseDurationMs(match[4]);
  if (durationMs === null) return null;
  const buckets = {};
  if (match[5]) {
    for (const item of match[5].split(', ')) {
      const splitAt = item.lastIndexOf(': ');
      if (splitAt === -1) continue;
      const label = item.slice(0, splitAt);
      const parsed = parseDurationMs(item.slice(splitAt + 2));
      if (parsed !== null) buckets[label] = parsed;
    }
  }
  return {
    method: match[1],
    route: match[2],
    status: Number(match[3]),
    durationMs,
    buckets,
    raw,
  };
}

export function parsePsGroup(output) {
  const processes = [];
  for (const line of String(output).split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const rssKib = Number(match[2]);
    const cpuPercent = Number(match[3]);
    if (![pid, rssKib, cpuPercent].every(Number.isFinite)) continue;
    processes.push({
      pid,
      rssBytes: rssKib * KIB,
      cpuPercent,
      command: match[4],
    });
  }
  if (processes.length === 0) {
    return {
      totalRssBytes: null,
      totalCpuPercent: null,
      processes: [],
      nextServerProcesses: [],
    };
  }
  return {
    totalRssBytes: processes.reduce((sum, process) => sum + process.rssBytes, 0),
    totalCpuPercent: processes.reduce((sum, process) => sum + process.cpuPercent, 0),
    processes,
    nextServerProcesses: processes.filter((process) => process.command.includes('next-server')),
  };
}

export function parseSwapUsage(output) {
  const values = {};
  for (const key of ['total', 'used', 'free']) {
    const match = String(output).match(new RegExp(`${key}\\s*=\\s*(\\d+(?:\\.\\d+)?[KMGT]?)`, 'i'));
    values[`${key}Bytes`] = match ? parseByteSize(match[1]) : null;
  }
  return values;
}

export function parseMemoryPressure(output) {
  const match = String(output).match(/System-wide memory free percentage:\s*(\d+(?:\.\d+)?)%/i);
  const freePercent = match ? parseFinite(match[1]) : null;
  return {
    freePercent,
    normal: freePercent !== null && freePercent >= PROFILE_THRESHOLDS.minMemoryPressureFreePercent,
  };
}

export function parseVmStat(output) {
  const text = String(output);
  const pageSizeMatch = text.match(/page size of\s+(\d+)\s+bytes/i);
  const freeMatch = text.match(/^Pages free:\s+(\d+)\./m);
  const inactiveMatch = text.match(/^Pages inactive:\s+(\d+)\./m);
  const pageSizeBytes = pageSizeMatch ? Number(pageSizeMatch[1]) : null;
  const freePages = freeMatch ? Number(freeMatch[1]) : null;
  const inactivePages = inactiveMatch ? Number(inactiveMatch[1]) : null;
  const freeInactiveBytes = [pageSizeBytes, freePages, inactivePages].every(Number.isFinite)
    ? pageSizeBytes * (freePages + inactivePages)
    : null;
  return { pageSizeBytes, freeInactiveBytes };
}

export function isValidProfileLabel(label) {
  return typeof label === 'string' && LABEL_PATTERN.test(label);
}

export function parseProfileArgs(argv) {
  let label = null;
  const unknown = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--label') label = argv[index += 1] ?? null;
    else if (arg.startsWith('--label=')) label = arg.slice('--label='.length);
    else unknown.push(arg);
  }
  if (unknown.length > 0) {
    return {
      label,
      refusal: profileReason('invalid-arguments', `unknown argument(s): ${unknown.join(', ')}`),
    };
  }
  if (!isValidProfileLabel(label)) {
    return {
      label,
      refusal: profileReason('invalid-label', 'label must match ^[a-z0-9-]{1,32}$'),
    };
  }
  return { label, refusal: null };
}

export function parseDatabaseTarget(databaseUrl, driver) {
  try {
    const url = new URL(databaseUrl ?? 'postgres://lgi:lgi@127.0.0.1:5433/lgi_tools');
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ''),
      driver: driver ?? null,
    };
  } catch {
    return null;
  }
}

export function isLocalDatabaseTarget(database) {
  return database !== null
    && database.driver === 'postgres-js'
    && LOOPBACK_HOSTS.has(database.host);
}

export function selectPreflightRefusal({ listeners, database, databaseReachable, memory }) {
  if (listeners.length > 0) {
    return profileReason('port-occupied', 'port 3000 is already occupied; no process was killed', {
      listeners,
    });
  }
  if (!isLocalDatabaseTarget(database)) {
    return profileReason(
      'postgres-not-local',
      'profiling requires LOCAL_DB_DRIVER=postgres-js and a loopback DATABASE_URL',
      {
        target: database
          ? {
            host: database.host,
            port: database.port,
            database: database.database,
            driver: database.driver,
          }
          : null,
      },
    );
  }
  if (!databaseReachable) {
    return profileReason('postgres-unreachable', 'local Postgres is unreachable', {
      target: { host: database.host, port: database.port, database: database.database },
    });
  }
  if (!memory.commandsOk || memory.pressure.freePercent === null || memory.vm.freeInactiveBytes === null) {
    return profileReason('memory-preflight-unavailable', 'macOS memory headroom could not be measured', {
      errors: memory.errors,
    });
  }
  if (!memory.pressure.normal) {
    return profileReason('memory-pressure', 'macOS memory pressure is not normal', {
      freePercent: memory.pressure.freePercent,
    });
  }
  if (memory.vm.freeInactiveBytes < PROFILE_THRESHOLDS.minFreeInactiveBytes) {
    return profileReason('memory-headroom', 'free plus inactive memory is below 6 GiB', {
      freeInactiveBytes: memory.vm.freeInactiveBytes,
    });
  }
  return null;
}

export function summarisePhaseSamples(samples, phase) {
  const selected = samples.filter((sample) => sample.phase === phase);
  const rss = selected.map((sample) => sample.totalRssBytes).filter(Number.isFinite);
  const cpu = selected.map((sample) => sample.totalCpuPercent).filter(Number.isFinite);
  return {
    sampleCount: selected.length,
    rssAverageBytes: rss.length ? rss.reduce((sum, value) => sum + value, 0) / rss.length : null,
    rssPeakBytes: rss.length ? Math.max(...rss) : null,
    cpuAveragePercent: cpu.length ? cpu.reduce((sum, value) => sum + value, 0) / cpu.length : null,
    cpuPeakPercent: cpu.length ? Math.max(...cpu) : null,
  };
}

function routePath(route, baseUrl) {
  try {
    return new URL(route, baseUrl).pathname;
  } catch {
    return route;
  }
}

export function isClaimableDevLog(
  entry,
  { route, requestStartedAtMs, drainedAtMs, baseUrl, logWaitMs },
) {
  const identityMatches = !entry.claimed
    && entry.method === 'GET'
    && routePath(entry.route, baseUrl) === routePath(route, baseUrl);
  const timeMatches = entry.atMs >= requestStartedAtMs - 1000
    && entry.atMs <= drainedAtMs + logWaitMs;
  return identityMatches && timeMatches;
}

export function resolveProfileOutcome(status, stopReason, teardownErrors) {
  if (status === 'ok' && teardownErrors.length > 0) {
    return {
      status: 'aborted',
      reason: profileReason('teardown-failed', 'dev-server teardown did not complete cleanly', {
        errors: teardownErrors,
      }),
    };
  }
  return { status, reason: stopReason };
}

function abortReason(code, message, sample) {
  return { code, message, atMs: sample.atMs, sample };
}

export function evaluateAbort(samples, startSwapBytes) {
  for (const sample of samples) {
    if (
      Number.isFinite(startSwapBytes)
      && Number.isFinite(sample.swapUsedBytes)
      && sample.swapUsedBytes - startSwapBytes > PROFILE_THRESHOLDS.maxSwapGrowthBytes
    ) {
      return abortReason('swap-growth', 'swap usage grew by more than 1 GiB', sample);
    }
  }
  for (const sample of samples) {
    if (
      Number.isFinite(sample.totalRssBytes)
      && sample.totalRssBytes > PROFILE_THRESHOLDS.maxRssBytes
    ) {
      return abortReason('rss-limit', 'profiled process group exceeded 4.5 GiB RSS', sample);
    }
  }
  let sustainedFrom = null;
  for (const sample of samples) {
    const highIdleCpu = sample.phase === 'idle'
      && Number.isFinite(sample.totalCpuPercent)
      && sample.totalCpuPercent >= PROFILE_THRESHOLDS.idleCpuPercent;
    if (!highIdleCpu) {
      sustainedFrom = null;
      continue;
    }
    sustainedFrom ??= sample.atMs;
    if (sample.atMs - sustainedFrom >= PROFILE_THRESHOLDS.idleCpuSustainMs) {
      return abortReason('idle-cpu', 'idle process-group CPU stayed at or above 800% for 20 seconds', sample);
    }
  }
  return null;
}

export function countDetailSentinels(html) {
  const text = String(html);
  return {
    waveSpawns: text.split('Wave Spawns').length - 1,
    noSleeperPresence: text.split('No Sleeper presence').length - 1,
  };
}

export function shapeProfileResult({
  label,
  status,
  reason,
  startedAt,
  finishedAt,
  details = {},
}) {
  const exitCode = { ok: 0, aborted: 1, refused: 2 }[status];
  if (exitCode === undefined) throw new Error(`unknown profile status: ${status}`);
  return {
    schemaVersion: 1,
    label,
    status,
    exitCode,
    reason,
    startedAt,
    finishedAt,
    ...details,
  };
}
