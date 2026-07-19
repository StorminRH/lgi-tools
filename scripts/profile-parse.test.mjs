import { describe, expect, it } from 'vitest';
import {
  EXPECTED_FULL_SITE_COUNT,
  PROFILE_THRESHOLDS,
  assessModeExpectation,
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
  parseDurationMs,
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
} from './profile-parse.mjs';

describe('parseDurationMs', () => {
  it.each([
    ['750µs', 0.75],
    ['12ms', 12],
    ['1.25s', 1250],
    ['2min', 120000],
  ])('parses %s', (raw, expected) => {
    expect(parseDurationMs(raw)).toBe(expected);
  });

  it('rejects unsupported or malformed durations', () => {
    expect(parseDurationMs('1h')).toBeNull();
    expect(parseDurationMs('fast')).toBeNull();
  });
});

describe('parseDevRequestLine', () => {
  it('parses the Next 16 request line and timing buckets', () => {
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
  });

  it('strips ANSI color before parsing while preserving the readable raw line', () => {
    const parsed = parseDevRequestLine('\u001b[32m GET / 200 in 850ms\u001b[39m');
    expect(parsed).toEqual({
      method: 'GET',
      route: '/',
      status: 200,
      durationMs: 850,
      buckets: {},
      raw: ' GET / 200 in 850ms',
    });
  });

  it('returns null for unrelated output', () => {
    expect(parseDevRequestLine('✓ Ready in 1.4s')).toBeNull();
  });
});

describe('parsePsGroup', () => {
  it('aggregates RSS and CPU while retaining next-server children', () => {
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
  });

  it('returns null aggregates when ps yields no usable samples', () => {
    expect(parsePsGroup('')).toEqual({
      totalRssBytes: null,
      totalCpuPercent: null,
      processes: [],
      nextServerProcesses: [],
    });
  });
});

describe('macOS memory parsers', () => {
  it('parses swap usage', () => {
    expect(parseSwapUsage('vm.swapusage: total = 4096.00M  used = 1.50G  free = 2560.00M')).toEqual({
      totalBytes: 4096 * 1024 * 1024,
      usedBytes: 1.5 * 1024 * 1024 * 1024,
      freeBytes: 2560 * 1024 * 1024,
    });
  });

  it('parses memory pressure and free plus inactive VM bytes', () => {
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
});

describe('profile labels', () => {
  it.each(['as-found', 'clean', 'after', 'sample', 'a1'])('accepts %s', (label) => {
    expect(isValidProfileLabel(label)).toBe(true);
  });

  it.each(['', 'UPPER', 'has space', '../escape', 'a'.repeat(33)])('rejects %s', (label) => {
    expect(isValidProfileLabel(label)).toBe(false);
  });
});

describe('parseProfileArgs', () => {
  it('accepts spaced and equals label forms', () => {
    expect(parseProfileArgs(['--label', 'clean'])).toEqual({ label: 'clean', refusal: null });
    expect(parseProfileArgs(['--label=as-found'])).toEqual({ label: 'as-found', refusal: null });
  });

  it('refuses missing, invalid, or unknown arguments', () => {
    expect(parseProfileArgs([]).refusal).toMatchObject({ code: 'invalid-label' });
    expect(parseProfileArgs(['--label', 'BAD']).refusal).toMatchObject({ code: 'invalid-label' });
    expect(parseProfileArgs(['--label', 'clean', '--wat']).refusal).toMatchObject({
      code: 'invalid-arguments',
    });
  });
});

describe('database preflight', () => {
  it('parses a database target without retaining credentials', () => {
    expect(parseDatabaseTarget('postgres://user:secret@localhost:5433/lgi_tools', 'postgres-js')).toEqual({
      host: 'localhost',
      port: 5433,
      database: 'lgi_tools',
      driver: 'postgres-js',
    });
  });

  it('accepts only the postgres-js loopback target', () => {
    expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@127.0.0.1:5433/db', 'postgres-js'))).toBe(true);
    expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@db.example.com/db', 'postgres-js'))).toBe(false);
    expect(isLocalDatabaseTarget(parseDatabaseTarget('postgres://x@localhost/db', 'neon-http'))).toBe(false);
  });
});

describe('selectPreflightRefusal', () => {
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

  it('returns null for a healthy local environment', () => {
    expect(selectPreflightRefusal(input())).toBeNull();
  });

  it.each([
    [input({ listeners: ['node'] }), 'port-occupied'],
    [input({ database: null }), 'postgres-not-local'],
    [input({ databaseReachable: false }), 'postgres-unreachable'],
    [input({ memory: { ...healthyMemory, commandsOk: false, errors: ['nope'] } }), 'memory-preflight-unavailable'],
    [input({ memory: { ...healthyMemory, pressure: { freePercent: 5, normal: false } } }), 'memory-pressure'],
    [input({ memory: { ...healthyMemory, vm: { freeInactiveBytes: 5 * 1024 ** 3 } } }), 'memory-headroom'],
  ])('selects %s', (candidate, code) => {
    expect(selectPreflightRefusal(candidate)).toMatchObject({ code });
  });
});

describe('sample and log selection', () => {
  it('summarises only the requested phase and ignores missing metrics', () => {
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
  });

  it('claims only an unclaimed matching GET inside the correlation window', () => {
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
});

describe('resolveProfileOutcome', () => {
  it('preserves a clean outcome', () => {
    expect(resolveProfileOutcome('ok', null, [])).toEqual({ status: 'ok', reason: null });
  });

  it('turns teardown errors into an aborted outcome', () => {
    expect(resolveProfileOutcome('ok', null, ['port open'])).toMatchObject({
      status: 'aborted',
      reason: { code: 'teardown-failed', errors: ['port open'] },
    });
  });
});

describe('evaluateAbort', () => {
  const gib = 1024 ** 3;
  const sample = (atMs, values = {}) => ({
    atMs,
    phase: 'idle',
    totalRssBytes: 100,
    totalCpuPercent: 100,
    swapUsedBytes: 2 * gib,
    ...values,
  });

  it('does not abort on the exact swap or RSS boundary', () => {
    const startSwapBytes = 2 * gib;
    expect(
      evaluateAbort(
        [
          sample(0, { swapUsedBytes: startSwapBytes + PROFILE_THRESHOLDS.maxSwapGrowthBytes }),
          sample(500, { totalRssBytes: PROFILE_THRESHOLDS.maxRssBytes }),
        ],
        startSwapBytes,
      ),
    ).toBeNull();
  });

  it('prioritises swap growth over RSS and sustained idle CPU', () => {
    const startSwapBytes = 2 * gib;
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
  });

  it('aborts only after a continuous 20 second idle CPU window', () => {
    const high = { totalCpuPercent: PROFILE_THRESHOLDS.idleCpuPercent };
    expect(evaluateAbort([sample(0, high), sample(19999, high)], 2 * gib)).toBeNull();
    expect(evaluateAbort([sample(0, high), sample(20000, high)], 2 * gib)).toMatchObject({
      code: 'idle-cpu',
    });
  });

  it('resets the sustained CPU window on low, missing, or non-idle samples', () => {
    const high = { totalCpuPercent: PROFILE_THRESHOLDS.idleCpuPercent };
    const samples = [
      sample(0, high),
      sample(10000, { totalCpuPercent: null }),
      sample(15000, high),
      sample(25000, { phase: 'prewarm', ...high }),
      sample(30000, high),
      sample(49999, high),
    ];
    expect(evaluateAbort(samples, 2 * gib)).toBeNull();
  });
});

describe('detail sentinel counting', () => {
  it('counts both detail-only strings', () => {
    expect(
      countDetailSentinels('Wave Spawns ... Wave Spawns ... No Sleeper presence'),
    ).toEqual({ waveSpawns: 2, noSleeperPresence: 1 });
  });
});

describe('catalogue markup extraction', () => {
  const html = `
    <main>
      <article data-lazy-details="one"></article>
      <details class="site" data-lazy-details></details>
      <div data-dev-sample="20/69"></div>
      <script>self.__next_f.push("<article data-lazy-details></article><div data-dev-sample=\\"1/2\\">")</script>
    </main>
  `;

  it('counts rendered card markers without counting RSC script decoys', () => {
    expect(extractCardCount(html)).toBe(2);
  });

  it('extracts the rendered sample marker and ignores script content', () => {
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
});

describe('catalogue mode expectation', () => {
  const marker = (shown, total) => ({ present: true, shown, total });
  const absent = { present: false, shown: null, total: null };
  const assess = (overrides = {}) => assessModeExpectation({
    cardCount: EXPECTED_FULL_SITE_COUNT,
    marker: absent,
    sampleEnv: false,
    expectedFullCount: EXPECTED_FULL_SITE_COUNT,
    ...overrides,
  });

  it('passes the normal full catalogue and the labeled reduced sample', () => {
    expect(assess()).toBe('pass');
    expect(assess({
      cardCount: 20,
      marker: marker(20, EXPECTED_FULL_SITE_COUNT),
      sampleEnv: true,
    })).toBe('pass');
  });

  it.each([
    [{ sampleEnv: false, cardCount: 20 }, 'marker-absent reduced normal count'],
    [{ sampleEnv: false, marker: marker(69, 69) }, 'marker present in normal mode'],
    [{ sampleEnv: true, cardCount: 20 }, 'sample marker absent'],
    [{ sampleEnv: true, cardCount: 20, marker: marker(20, 68) }, 'wrong full-count oracle'],
    [{ sampleEnv: true, cardCount: 19, marker: marker(20, 69) }, 'card/marker mismatch'],
    [{ sampleEnv: true, cardCount: 69, marker: marker(69, 69) }, 'unreduced sample'],
    [{
      sampleEnv: true,
      cardCount: 20,
      marker: { present: true, shown: null, total: null },
    }, 'malformed marker'],
  ])('fails %s', (overrides) => {
    expect(assess(overrides)).toBe('fail');
  });
});

describe('catalogue mode evidence', () => {
  it('shapes a passing sampled result from the measured cold request', () => {
    expect(buildCatalogueModeEvidence(
      {
        cardCount: 20,
        devSampleMarker: { present: true, shown: 20, total: 69 },
      },
      { sampleEnv: true },
    )).toEqual({
      sampleEnv: true,
      expectedFullCount: 69,
      cardCount: 20,
      devSampleMarker: { present: true, shown: 20, total: 69 },
      modeCheck: 'pass',
    });
  });

  it('shapes an explicit failure when no cold measurement exists', () => {
    expect(buildCatalogueModeEvidence(undefined, { sampleEnv: false })).toEqual({
      sampleEnv: false,
      expectedFullCount: 69,
      cardCount: null,
      devSampleMarker: { present: false, shown: null, total: null },
      modeCheck: 'fail',
    });
  });
});

describe('profile suite aggregation', () => {
  function run(label, sampleEnv, coldMs, warmMs = [500, 510], overrides = {}) {
    return {
      label,
      status: 'ok',
      modeCheck: 'pass',
      sampleEnv,
      measurements: {
        coldSites: { durationMs: coldMs },
        warmSites: warmMs.map((durationMs) => ({ durationMs })),
      },
      ...overrides,
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

  it('reports raw values, medians, ranges, and a passing completion gate', () => {
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
  });

  it('fails the exact 60-second cold boundary', () => {
    const runs = passingRuns();
    runs[0].measurements.coldSites.durationMs = 60_000;

    expect(summariseProfileSuite(runs).gates.allColdBelowLimit).toBe(false);
    expect(summariseProfileSuite(runs).gates.passed).toBe(false);
  });

  it('fails a sample median above 110 percent of the normal median', () => {
    const runs = passingRuns().map((candidate) => ({
      ...candidate,
      measurements: {
        ...candidate.measurements,
        coldSites: { durationMs: candidate.sampleEnv ? 1101 : 1000 },
      },
    }));

    expect(summariseProfileSuite(runs).gates.sampleColdNoRegression).toBe(false);
  });

  it('fails missing, aborted, or mode-mismatched runs', () => {
    const missing = passingRuns().slice(0, 5);
    expect(summariseProfileSuite(missing).gates.allRunsPresent).toBe(false);

    const failed = passingRuns();
    failed[0] = { ...failed[0], status: 'aborted' };
    failed[1] = { ...failed[1], modeCheck: 'fail' };
    const summary = summariseProfileSuite(failed);
    expect(summary.gates.allRunsOk).toBe(false);
    expect(summary.gates.allModeChecksPass).toBe(false);
    expect(summary.gates.passed).toBe(false);
  });
});

describe('shapeProfileResult', () => {
  it.each([
    ['ok', 0],
    ['aborted', 1],
    ['refused', 2],
  ])('maps %s to its exit code and stable schema', (status, exitCode) => {
    expect(
      shapeProfileResult({
        label: 'clean',
        status,
        reason: status === 'ok' ? null : { code: 'example', message: 'example' },
        startedAt: '2026-07-18T00:00:00.000Z',
        finishedAt: '2026-07-18T00:01:00.000Z',
        details: { measured: true },
      }),
    ).toEqual({
      schemaVersion: 1,
      label: 'clean',
      status,
      exitCode,
      reason: status === 'ok' ? null : { code: 'example', message: 'example' },
      startedAt: '2026-07-18T00:00:00.000Z',
      finishedAt: '2026-07-18T00:01:00.000Z',
      measured: true,
    });
  });
});
