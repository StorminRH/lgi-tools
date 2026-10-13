import type { z } from 'zod';
import type { ConvexDoor } from '@/lib/convex-door-contract';
import { resolveConvexServiceDoor } from '@/lib/convex-service-door';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { timeDependency } from '@/lib/dependency-timing';

/**
 * A Convex door that could not answer: unset or unsafe configuration, a failed
 * request, a non-2xx status, invalid JSON, or a reply its contract rejects.
 * Each owner subclasses it in one line and names the subclass explicitly,
 * because minified server builds can mangle class names.
 */
export class ConvexDoorError extends Error {
  override readonly name: string = 'ConvexDoorError';
}

export interface ConvexDoorOptions {
  /** Prefixes every failure message. */
  readonly label: string;
  /** The ConvexDoorError subclass a failure throws; ConvexDoorError itself when unset. */
  readonly error?: typeof ConvexDoorError;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export async function postConvexHttpDoor<Req extends z.ZodType, Res extends z.ZodType>(
  { path, response: responseSchema }: ConvexDoor<`/${string}`, Req, Res>,
  body: NoInfer<z.input<Req>>,
  { label, error: DoorError = ConvexDoorError, timeoutMs, signal }: ConvexDoorOptions,
): Promise<z.output<Res>> {
  const door = resolveConvexServiceDoor();
  if (!door.ok) {
    throw new DoorError(
      `${label}: Convex URL or service secret is unset or unsafe (${door.reason})`,
    );
  }
  const { siteUrl, secret } = door;

  const init = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  };
  let response: Response;
  try {
    response = await timeDependency('convex', () =>
      timeoutMs === undefined
        ? fetchWithTimeout(`${siteUrl}${path}`, init)
        : fetchWithTimeout(`${siteUrl}${path}`, init, timeoutMs),
    );
  } catch (cause) {
    throw new DoorError(`${label}: ${path} request failed`, { cause });
  }
  if (!response.ok) {
    throw new DoorError(`${label}: ${path} answered ${response.status}`);
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch (cause) {
    throw new DoorError(`${label}: ${path} returned invalid JSON`, { cause });
  }
  const parsed = responseSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new DoorError(`${label}: ${path} returned an invalid contract`);
  }
  return parsed.data;
}
