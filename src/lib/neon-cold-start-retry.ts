import { isTimeoutError } from '@/lib/error-chain';
import { sleep } from '@/lib/retry';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;
const MAX_CHAIN_DEPTH = 10;

export interface NeonColdStartMetric {
  outcome: 'recovered' | 'exhausted';
  attempts: number;
  totalDelayMs: number;
}

export type NeonColdStartMetricSink = (metric: NeonColdStartMetric) => void | Promise<void>;

let metricSink: NeonColdStartMetricSink | null = null;

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

function isRetryable(error: unknown, retryTimeouts: boolean): boolean {
  return isNeonColdStartError(error) || (retryTimeouts && isTimeoutError(error));
}

async function retryDelayFor(
  error: unknown,
  attempt: number,
  totalDelayMs: number,
  retryTimeouts: boolean,
): Promise<number> {
  if (!isRetryable(error, retryTimeouts)) throw error;
  if (attempt >= MAX_ATTEMPTS) {
    await emitMetric({ outcome: 'exhausted', attempts: attempt, totalDelayMs });
    throw error;
  }
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

async function pauseBeforeRetry(
  label: string,
  attempt: number,
  err: unknown,
  delayMs: number,
): Promise<void> {
  const summary = err instanceof Error ? err.message.split('\n')[0] : String(err);
  console.warn(
    `[${label}] attempt ${attempt}/${MAX_ATTEMPTS} failed (${summary}); retrying in ${delayMs}ms`,
  );
  await sleep(delayMs);
}

export function isNeonColdStartError(err: unknown): boolean {
  if (isTimeoutError(err)) return false;
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
 * Runs a read, retrying a Neon cold start up to 4 attempts on a 500ms, 1s,
 * 2s backoff. A timeout abort fails at once unless `retryTimeouts` is set;
 * `label` tags each attempt's warn line.
 */
export async function withColdStartRetry<T>(
  read: () => Promise<T>,
  options: { readonly label?: string; readonly retryTimeouts?: boolean } = {},
): Promise<T> {
  const { label = 'neon-cold-start-retry', retryTimeouts = false } = options;
  let totalDelayMs = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await read();
      if (attempt > 1) {
        await emitMetric({ outcome: 'recovered', attempts: attempt, totalDelayMs });
      }
      return result;
    } catch (err) {
      const delayMs = await retryDelayFor(err, attempt, totalDelayMs, retryTimeouts);
      totalDelayMs += delayMs;
      await pauseBeforeRetry(label, attempt, err, delayMs);
    }
  }
}
