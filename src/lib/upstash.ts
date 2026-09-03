import { Redis } from '@upstash/redis';
import { addDependencyTiming } from '@/lib/dependency-timing';
import { isHostedVercel, readEnv } from '@/lib/env';

function completeRestPair(
  urlName: 'KV_REST_API_URL' | 'UPSTASH_REDIS_REST_URL',
  tokenName: 'KV_REST_API_TOKEN' | 'UPSTASH_REDIS_REST_TOKEN',
): { url: string; token: string } | null {
  const url = readEnv(urlName);
  const token = readEnv(tokenName);
  return url && token ? { url, token } : null;
}

export function resolveUpstashRest(): { url: string; token: string } | null {
  return (
    completeRestPair('KV_REST_API_URL', 'KV_REST_API_TOKEN')
    ?? completeRestPair('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN')
  );
}

export function allowUnconfiguredUpstash(): boolean {
  return !isHostedVercel();
}

export type UpstashRedis = Redis;

export interface UpstashClientConfig {
  url: string;
  token: string;
  timeoutMs: number;
  retries: number;
  automaticDeserialization?: boolean;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException('signal timed out', 'TimeoutError')),
    timeoutMs,
  );
  return controller.signal;
}

function timeRedisSettlement<T>(result: T, startedAt: number): T {
  if (
    typeof result !== 'object'
    || result === null
    || typeof (result as { then?: unknown }).then !== 'function'
  ) {
    return result;
  }
  const record = (): void => {
    addDependencyTiming('redis', Date.now() - startedAt);
  };
  void (result as unknown as PromiseLike<unknown>).then(record, record);
  return result;
}

function withCommandTiming<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const method = value.bind(target) as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        const startedAt = Date.now();
        const result = method(...args);
        if (result === target) return receiver;
        if (prop === 'pipeline' || prop === 'multi') {
          return withCommandTiming(result as object);
        }
        return timeRedisSettlement(result, startedAt);
      };
    },
  });
}

export function createUpstashClient(config: UpstashClientConfig): UpstashRedis {
  return withCommandTiming(
    new Redis({
      url: config.url,
      token: config.token,
      automaticDeserialization: config.automaticDeserialization,
      signal: () => timeoutSignal(config.timeoutMs),
      retry: { retries: config.retries },
    }),
  );
}

export function resolveUpstashClient(options: {
  timeoutMs: number;
  retries: number;
  automaticDeserialization?: boolean;
}): UpstashRedis | null {
  const upstash = resolveUpstashRest();
  if (!upstash) return null;
  return createUpstashClient({ ...upstash, ...options });
}
