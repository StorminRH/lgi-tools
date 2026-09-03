import type { z } from 'zod';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';

export type ConvexHttpDoorError = new (
  message: string,
  options?: { cause?: unknown },
) => Error;

export async function postConvexHttpDoor<T>({
  path,
  body,
  schema,
  error: DoorError,
  label,
  timeoutMs,
  signal,
}: {
  readonly path: `/${string}`;
  readonly body: unknown;
  readonly schema: z.ZodType<T>;
  readonly error: ConvexHttpDoorError;
  readonly label: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}): Promise<T> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  const siteUrl = convexUrl ? deriveConvexSiteUrl(convexUrl) : null;
  if (siteUrl === null || !secret) {
    throw new DoorError(`${label}: Convex URL or service secret is unset`);
  }

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
    response =
      timeoutMs === undefined
        ? await fetchWithTimeout(`${siteUrl}${path}`, init)
        : await fetchWithTimeout(`${siteUrl}${path}`, init, timeoutMs);
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
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new DoorError(`${label}: ${path} returned an invalid contract`);
  }
  return parsed.data;
}
