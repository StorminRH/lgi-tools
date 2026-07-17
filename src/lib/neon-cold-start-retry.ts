// Retry wrapper for the prerender-reachable `'use cache'` DB reads. During
// `next build`, static prerender can hit a Neon compute that scaled to zero
// (Launch plan, fixed 5-min suspend — the multi-minute compile phase after the
// migrate/ingest scripts is enough to idle it out), and Vercel never retries a
// failed prerender: one connection-class error kills the whole deploy.
//
// Design constraints (settled in the 2026-06 infra audit):
// - NEVER catch-and-return-empty — an empty result would be cached into the
//   long-lived `use cache` entries. On exhaustion the last error is RETHROWN,
//   so a genuinely broken build still fails loudly. (Next never stores a
//   failed cache fill, so the rethrow cannot poison the cache.)
// - Retry ONLY the connection-class error signature of a cold start; SQL and
//   logic errors rethrow immediately on the first attempt.
// - The whole envelope must stay well under Next's ~50 s prerender cache-fill
//   ceiling. Nested wraps multiply (getPricedSiteDetail → getSiteDetail can
//   stack up to 4×4 attempts when the DB is hard-down) — that worst case only
//   delays an already-failing build, but keep it in mind before raising the
//   attempt count or base delay.

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
// Guard against pathological/cyclic cause chains while walking.
const MAX_CHAIN_DEPTH = 10;

/**
 * One Neon cold-start retry observation with attempt count and elapsed milliseconds; it contains
 * no query text or user identity.
 */
export interface NeonColdStartMetric {
  outcome: 'recovered' | 'exhausted';
  attempts: number;
  totalDelayMs: number;
}

type NeonColdStartMetricSink = (metric: NeonColdStartMetric) => void | Promise<void>;

let metricSink: NeonColdStartMetricSink | null = null;

/**
 * Installs or clears the callback that receives Neon cold-start retry metrics; callers own sink
 * lifetime and must avoid throwing.
 */
export function configureNeonColdStartMetricSink(
  sink: NeonColdStartMetricSink | null,
): void {
  metricSink = sink;
}

async function emitMetric(metric: NeonColdStartMetric): Promise<void> {
  if (!metricSink) return;
  try {
    await metricSink(metric);
  } catch (error) {
    console.error('[neon-cold-start-retry] telemetry write failed', error);
  }
}

async function retryDelayFor(
  error: unknown,
  attempt: number,
  totalDelayMs: number,
): Promise<number> {
  if (!isNeonColdStartError(error)) throw error;
  if (attempt >= MAX_ATTEMPTS) {
    await emitMetric({ outcome: 'exhausted', attempts: attempt, totalDelayMs });
    throw error;
  }
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

/**
 * The neon-http driver (\@neondatabase/serverless) has exactly three
 * `NeonDbError` constructions on the query path; two are connection-class:
 * - fetch rejection → message `Error connecting to database: ${err}` (the
 *   observed build-killer: "... fetch failed"), with `sourceError` set;
 * - non-400 HTTP failure from the proxy → `Server error (HTTP status N): ...`
 *   (5xx covers the compute-wake window; 4xx is auth/config — not retried).
 * SQL errors arrive with a real SQLSTATE in `code`: class 08 (connection
 * exception) and 57P03 (cannot_connect_now, "the database system is starting
 * up") are the cold-start-shaped ones. Drizzle wraps every query error in
 * DrizzleQueryError with `cause` set, so the matcher walks the chain — it
 * works with or without the wrapper.
 */
export function isNeonColdStartError(err: unknown): boolean {
  let node: unknown = err;
  for (let depth = 0; depth < MAX_CHAIN_DEPTH && node instanceof Error; depth++) {
    if (node.name === 'NeonDbError') {
      const code = (node as { code?: unknown }).code;
      if (
        node.message.startsWith('Error connecting to database') ||
        /^Server error \(HTTP status 5\d\d\)/.test(node.message) ||
        (typeof code === 'string' && (code.startsWith('08') || code === '57P03'))
      ) {
        return true;
      }
    }
    node =
      (node as { cause?: unknown }).cause ??
      (node as { sourceError?: unknown }).sourceError;
  }
  return false;
}

/**
 * Runs `read`, retrying cold-start-class failures with exponential backoff
 * (500 ms / 1 s / 2 s between the 4 attempts). Every retry logs a console.warn
 * so a recovered build is visible in the Vercel build logs. Non-matching
 * errors rethrow immediately; exhaustion rethrows the last error.
 */
export async function withColdStartRetry<T>(read: () => Promise<T>): Promise<T> {
  let totalDelayMs = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await read();
      if (attempt > 1) {
        await emitMetric({ outcome: 'recovered', attempts: attempt, totalDelayMs });
      }
      return result;
    } catch (err) {
      const delayMs = await retryDelayFor(err, attempt, totalDelayMs);
      totalDelayMs += delayMs;
      const summary = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn(
        `[neon-cold-start-retry] attempt ${attempt}/${MAX_ATTEMPTS} failed (${summary}); retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
