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

const MAX_TIMEOUT_SEARCH_NODES = 16;

export function hasTimeoutAbort(err: unknown): boolean {
  const pending: unknown[] = [err];
  for (let visited = 0; visited < MAX_TIMEOUT_SEARCH_NODES && visited < pending.length; visited++) {
    const node = pending[visited];
    if (node == null) continue;
    if ((node as { name?: unknown }).name === 'TimeoutError') return true;
    const { cause, sourceError } = node as { cause?: unknown; sourceError?: unknown };
    if (cause != null) pending.push(cause);
    if (sourceError != null) pending.push(sourceError);
  }
  return false;
}

export async function pauseBeforeRetry(
  label: string,
  attempt: number,
  maxAttempts: number,
  err: unknown,
  delayMs: number,
): Promise<void> {
  const summary = err instanceof Error ? err.message.split('\n')[0] : String(err);
  console.warn(
    `[${label}] attempt ${attempt}/${maxAttempts} failed (${summary}); retrying in ${delayMs}ms`,
  );
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isNeonColdStartError(err: unknown): boolean {
  if (hasTimeoutAbort(err)) return false;
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
      await pauseBeforeRetry('neon-cold-start-retry', attempt, MAX_ATTEMPTS, err, delayMs);
    }
  }
}
