import { expect, test } from 'vitest';
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
  resolveProfileOutcome,
  selectPreflightRefusal,
  shapeProfileResult,
  summariseProfileSuite,
  summarisePhaseSamples,
  timestampSlug,
} from './profile-parse.mjs';

test('parseDevRequestLine reads the Next 16 request line, its timing buckets and durations, and nothing else', () => {
  const raw = ' GET /sites 200 in 1.25s (next.js: 40ms, proxy.ts: 750µs, application-code: 1.2s)';
  expect(parseDevRequestLine(raw)).toEqual({
    method: 'GET',
    route: '/sites',
    status: 200,
    durationMs: 1250,
    buckets: {
      'next.js': 40,
      'proxy.ts': 0.75,
      'application-code': 1200,
    },
    raw,
  });
  expect(parseDevRequestLine(' GET /sites 200 in 2min')?.durationMs).toBe(120000);

  // ANSI color is stripped before parsing, and the readable raw line kept.
  expect(parseDevRequestLine('\u001b[32m GET / 200 in 850ms\u001b[39m')).toEqual({
    method: 'GET',
    route: '/',
    status: 200,
    durationMs: 850,
    buckets: {},
    raw: ' GET / 200 in 850ms',
  });

  expect(parseDevRequestLine(' GET /sites 200 in 1h')).toBeNull();
  expect(parseDevRequestLine(' GET /sites 200 in fast')).toBeNull();
  expect(parseDevRequestLine('✓ Ready in 1.4s')).toBeNull();
});

test('parsePsGroup aggregates RSS and CPU while retaining next-server children, and is null without samples', () => {
  expect(
    parsePsGroup(`
101 2048 12.5 pnpm
102 4096 87.25 next-server (v16.2.6)
103 1024 0.5 node
`),
  ).toEqual({
    totalRssBytes: 7 * 1024 * 1024,
    totalCpuPercent: 100.25,
    processes: [
      { pid: 101, rssBytes: 2 * 1024 * 1024, cpuPercent: 12.5, command: 'pnpm' },
      {
        pid: 102,
        rssBytes: 4 * 1024 * 1024,
        cpuPercent: 87.25,
        command: 'next-server (v16.2.6)',
      },
      { pid: 103, rssBytes: 1024 * 1024, cpuPercent: 0.5, command: 'node' },
    ],
    nextServerProcesses: [
      {
        pid: 102,
        rssBytes: 4 * 1024 * 1024,
        cpuPercent: 87.25,
        command: 'next-server (v16.2.6)',
      },
    ],
  });
  expect(parsePsGroup('')).toEqual({
    totalRssBytes: null,
    totalCpuPercent: null,
    processes: [],
    nextServerProcesses: [],
  });
});

test('macOS memory parsers read swap usage, memory pressure, and free plus inactive VM bytes', () => {
  expect(parseSwapUsage('vm.swapusage: total = 4096.00M  used = 1.50G  free = 2560.00M')).toEqual({
    totalBytes: 4096 * 1024 * 1024,
    usedBytes: 1.5 * 1024 * 1024 * 1024,
    freeBytes: 2560 * 1024 * 1024,
  });
  expect(parseMemoryPressure('System-wide memory free percentage: 81%')).toEqual({
    freePercent: 81,
    normal: true,
  });
  expect(parseMemoryPressure('System-wide memory free percentage: 9%')).toEqual({
    freePercent: 9,
    normal: false,
  });
  expect(
    parseVmStat(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free: 1000.
Pages inactive: 2000.
Pages speculative: 500.`),
  ).toEqual({
    pageSizeBytes: 16384,
    freeInactiveBytes: 3000 * 16384,
  });
});

test('profile arguments take a filename-safe label in either form and refuse anything else', () => {
  for (const label of ['as-found', 'a1']) expect(isValidProfileLabel(label)).toBe(true);
  for (const label of ['', 'UPPER', 'has space', '../escape', 'a'.repeat(33)]) {
    expect(isValidProfileLabel(label)).toBe(false);
  }
  expect(timestampSlug('2026-10-09T12:34:56.789Z')).toBe('20261009T123456789Z');

  expect(parseProfileArgs(['--label', 'clean'])).toEqual({ label: 'clean', refusal: null });
  expect(parseProfileArgs(['--label=as-found'])).toEqual({ label: 'as-found', refusal: null });
  expect(parseProfileArgs([]).refusal).toMatchObject({ code: 'invalid-label' });
  expect(parseProfileArgs(['--label', 'BAD']).refusal).toMatchObject({ code: 'invalid-label' });
  expect(parseProfileArgs(['--label', 'clean', '--wat']).refusal).toMatchObject({
    code: 'invalid-arguments',
  });
});

test('the preflight keeps no database credentials, accepts only a local postgres-js target, and names each refusal', () => {
  expect(parseDatabaseTarget('postgres://user:secret@localhost:5433/lgi_tools', 'postgres-js')).toEqual({
    host: 'localhost',
    port: 5433,
    database: 'lgi_tools',
    driver: 'postgres-js',
  });
  expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@127.0.0.1:5433/db', 'postgres-js'))).toBe(true);
  expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@[::1]:5433/db', 'postgres-js'))).toBe(true);
  expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@db.example.com/db', 'postgres-js'))).toBe(false);
  expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@localhost/db', 'neon-http'))).toBe(false);

  const database = parseDatabaseTarget('postgres://x@localhost:5433/lgi_tools', 'postgres-js');
  const healthyMemory = {
    commandsOk: true,
    pressure: { freePercent: 50, normal: true },
    vm: { freeInactiveBytes: 8 * 1024 ** 3 },
    errors: [],
  };
  const input = (overrides = {}) => ({
    listeners: [],
    database,
    databaseReachable: true,
    memory: healthyMemory,
    ...overrides,
  });
  expect(selectPreflightRefusal(input())).toBeNull();
  for (const [candidate, code] of [
    [input({ listeners: ['node'] }), 'port-occupied'],
    [input({ database: null }), 'postgres-not-local'],
    [input({ databaseReachable: false }), 'postgres-unreachable'],
    [input({ memory: { ...healthyMemory, commandsOk: false, errors: ['nope'] } }), 'memory-preflight-unavailable'],
    [input({ memory: { ...healthyMemory, pressure: { freePercent: 5, normal: false } } }), 'memory-pressure'],
    [input({ memory: { ...healthyMemory, vm: { freeInactiveBytes: 5 * 1024 ** 3 } } }), 'memory-headroom'],
  ]) {
    expect(selectPreflightRefusal(candidate)).toMatchObject({ code });
  }
});

test('phase summaries skip missing metrics, and only an unclaimed matching GET in the window claims a dev log', () => {
  expect(
    summarisePhaseSamples([
      { phase: 'idle', totalRssBytes: 100, totalCpuPercent: 10 },
      { phase: 'idle', totalRssBytes: 300, totalCpuPercent: null },
      { phase: 'cold', totalRssBytes: 900, totalCpuPercent: 90 },
    ], 'idle'),
  ).toEqual({
    sampleCount: 2,
    rssAverageBytes: 200,
    rssPeakBytes: 300,
    cpuAveragePercent: 10,
    cpuPeakPercent: 10,
  });

  const args = {
    route: '/sites',
    requestStartedAtMs: 1000,
    drainedAtMs: 2000,
    baseUrl: 'http://localhost:3000',
    logWaitMs: 10000,
  };
  expect(isClaimableDevLog({ claimed: false, method: 'GET', route: '/sites?x=1', atMs: 1500 }, args)).toBe(true);
  expect(isClaimableDevLog({ claimed: true, method: 'GET', route: '/sites', atMs: 1500 }, args)).toBe(false);
  expect(isClaimableDevLog({ claimed: false, method: 'POST', route: '/sites', atMs: 1500 }, args)).toBe(false);
  expect(isClaimableDevLog({ claimed: false, method: 'GET', route: '/', atMs: 1500 }, args)).toBe(false);
});

test('a clean outcome stays clean, and teardown errors abort it', () => {
  expect(resolveProfileOutcome('ok', null, [])).toEqual({ status: 'ok', reason: null });
  expect(resolveProfileOutcome('ok', null, ['port open'])).toMatchObject({
    status: 'aborted',
    reason: { code: 'teardown-failed', errors: ['port open'] },
  });
});

test('evaluateAbort trips past the swap and RSS limits, swap first, and on 20 continuous seconds of idle CPU', () => {
  const gib = 1024 ** 3;
  const startSwapBytes = 2 * gib;
  const sample = (atMs, values = {}) => ({
    atMs,
    phase: 'idle',
    totalRssBytes: 100,
    totalCpuPercent: 100,
    swapUsedBytes: startSwapBytes,
    ...values,
  });

  // The exact boundaries do not abort.
  expect(
    evaluateAbort(
      [
        sample(0, { swapUsedBytes: startSwapBytes + PROFILE_THRESHOLDS.maxSwapGrowthBytes }),
        sample(500, { totalRssBytes: PROFILE_THRESHOLDS.maxRssBytes }),
      ],
      startSwapBytes,
    ),
  ).toBeNull();
  expect(
    evaluateAbort(
      [
        sample(0, { totalCpuPercent: 900 }),
        sample(20000, {
          totalCpuPercent: 900,
          totalRssBytes: PROFILE_THRESHOLDS.maxRssBytes + 1,
          swapUsedBytes: startSwapBytes + PROFILE_THRESHOLDS.maxSwapGrowthBytes + 1,
        }),
      ],
      startSwapBytes,
    ),
  ).toMatchObject({ code: 'swap-growth' });

  const high = { totalCpuPercent: PROFILE_THRESHOLDS.idleCpuPercent };
  expect(evaluateAbort([sample(0, high), sample(19999, high)], startSwapBytes)).toBeNull();
  expect(evaluateAbort([sample(0, high), sample(20000, high)], startSwapBytes)).toMatchObject({
    code: 'idle-cpu',
  });
  // Low, missing, or non-idle samples restart the window.
  expect(evaluateAbort([
    sample(0, high),
    sample(10000, { totalCpuPercent: null }),
    sample(15000, high),
    sample(25000, { phase: 'prewarm', ...high }),
    sample(30000, high),
    sample(49999, high),
  ], startSwapBytes)).toBeNull();
});

test('catalogue markup counts rendered cards and reads the sample marker, ignoring RSC script decoys', () => {
  expect(
    countDetailSentinels('Wave spawns ... Wave spawns ... No Sleeper presence'),
  ).toEqual({ waveSpawns: 2, noSleeperPresence: 1 });

  const html = `
    <main>
      <article data-lazy-details="one"></article>
      <details class="site" data-lazy-details></details>
      <div data-dev-sample="20/69"></div>
      <script>self.__next_f.push("<article data-lazy-details></article><div data-dev-sample=\\"1/2\\">")</script>
    </main>
  `;
  expect(extractCardCount(html)).toBe(2);
  // Regex metacharacters in the marker are taken literally.
  expect(
    extractCardCount('<article data-lazy-details></article><article dataXlazy-details></article>'),
  ).toBe(1);
  expect(extractDevSampleMarker(html)).toEqual({ present: true, shown: 20, total: 69 });
  expect(extractDevSampleMarker('<main></main>')).toEqual({
    present: false,
    shown: null,
    total: null,
  });
  expect(extractDevSampleMarker('<div data-dev-sample="oops"></div>')).toEqual({
    present: true,
    shown: null,
    total: null,
  });
});

test('catalogue mode passes the full catalogue and the labeled reduced sample, and fails every mismatch', () => {
  const marker = (shown, total) => ({ present: true, shown, total });
  const absent = { present: false, shown: null, total: null };
  const assess = (overrides = {}) => buildCatalogueModeEvidence(
    {
      cardCount: overrides.cardCount ?? 69,
      devSampleMarker: overrides.marker ?? absent,
    },
    {
      sampleEnv: overrides.sampleEnv ?? false,
      expectedFullCount: overrides.expectedFullCount ?? 69,
    },
  ).modeCheck;

  expect(assess()).toBe('pass');
  expect(assess({ cardCount: 20, marker: marker(20, 69), sampleEnv: true })).toBe('pass');
  for (const overrides of [
    { sampleEnv: false, cardCount: 20 },
    { sampleEnv: false, marker: marker(69, 69) },
    { sampleEnv: true, cardCount: 20 },
    { sampleEnv: true, cardCount: 20, marker: marker(20, 68) },
    { sampleEnv: true, cardCount: 19, marker: marker(20, 69) },
    { sampleEnv: true, cardCount: 69, marker: marker(69, 69) },
    { sampleEnv: true, cardCount: 20, marker: { present: true, shown: null, total: null } },
  ]) {
    expect(assess(overrides), JSON.stringify(overrides)).toBe('fail');
  }

  // With no cold measurement, the evidence is an explicit failure.
  expect(buildCatalogueModeEvidence(undefined, { sampleEnv: false })).toEqual({
    sampleEnv: false,
    expectedFullCount: 69,
    cardCount: null,
    devSampleMarker: { present: false, shown: null, total: null },
    modeCheck: 'fail',
  });
});

test('the profile suite reports raw values, medians and ranges, and its completion gate fails on any lapse', () => {
  function run(label, sampleEnv, coldMs, warmMs) {
    return {
      label,
      status: 'ok',
      modeCheck: 'pass',
      sampleEnv,
      measurements: {
        coldSites: { durationMs: coldMs },
        warmSites: warmMs.map((durationMs) => ({ durationMs })),
      },
    };
  }
  function passingRuns() {
    return [
      run('after-1', false, 1000, [500, 510]),
      run('sample-1', true, 1050, [450, 460]),
      run('sample-2', true, 1100, [455, 465]),
      run('after-2', false, 1100, [520, 530]),
      run('after-3', false, 1200, [540, 550]),
      run('sample-3', true, 1150, [470, 480]),
    ];
  }

  const summary = summariseProfileSuite(passingRuns());
  expect(summary.conditions.after.cold).toEqual({
    valuesMs: [1000, 1100, 1200],
    medianMs: 1100,
    rangeMs: { min: 1000, max: 1200 },
  });
  expect(summary.conditions.sample.warm.valuesMs).toHaveLength(6);
  expect(summary.gates).toEqual({
    allRunsPresent: true,
    allRunsOk: true,
    allModeChecksPass: true,
    allColdBelowLimit: true,
    sampleColdNoRegression: true,
    passed: true,
  });

  // The exact 60-second cold boundary fails.
  const slow = passingRuns();
  slow[0].measurements.coldSites.durationMs = 60_000;
  expect(summariseProfileSuite(slow).gates).toMatchObject({ allColdBelowLimit: false, passed: false });

  // A sample median above 110 percent of the normal median fails.
  const regressed = passingRuns().map((candidate) => ({
    ...candidate,
    measurements: {
      ...candidate.measurements,
      coldSites: { durationMs: candidate.sampleEnv ? 1101 : 1000 },
    },
  }));
  expect(summariseProfileSuite(regressed).gates.sampleColdNoRegression).toBe(false);

  expect(summariseProfileSuite(passingRuns().slice(0, 5)).gates.allRunsPresent).toBe(false);
  const failed = passingRuns();
  failed[0] = { ...failed[0], status: 'aborted' };
  failed[1] = { ...failed[1], modeCheck: 'fail' };
  expect(summariseProfileSuite(failed).gates).toMatchObject({
    allRunsOk: false,
    allModeChecksPass: false,
    passed: false,
  });
});

test('shapeProfileResult maps each status to its exit code and stable schema', () => {
  for (const [status, exitCode] of [['ok', 0], ['aborted', 1], ['refused', 2]]) {
    const reason = status === 'ok' ? null : { code: 'example', message: 'example' };
    expect(
      shapeProfileResult({
        label: 'clean',
        status,
        reason,
        startedAt: '2026-07-18T00:00:00.000Z',
        finishedAt: '2026-07-18T00:01:00.000Z',
        details: { measured: true },
      }),
    ).toEqual({
      schemaVersion: 1,
      label: 'clean',
      status,
      exitCode,
      reason,
      startedAt: '2026-07-18T00:00:00.000Z',
      finishedAt: '2026-07-18T00:01:00.000Z',
      measured: true,
    });
  }
});
