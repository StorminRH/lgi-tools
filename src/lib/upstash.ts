import { Redis } from '@upstash/redis';
import { isThenable, startDependencyTimer } from '@/lib/dependency-timing';
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

function withCommandTiming<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== 'function') return value;
      const method = value.bind(target) as (...args: unknown[]) => unknown;
      return (...args: unknown[]): unknown => {
        const stop = startDependencyTimer('redis');
        const result = method(...args);
        if (result === target) return receiver;
        if (prop === 'pipeline' || prop === 'multi') {
          return withCommandTiming(result as object);
        }
        if (isThenable(result)) void result.then(stop, stop);
        return result;
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
