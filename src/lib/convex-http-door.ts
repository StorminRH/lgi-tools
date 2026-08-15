// One outbound Convex HTTP service door. Composition slices (jump resolver,
// signature elimination) post JSON to a `.convex.site` path with the shared
// bearer secret, then parse the body against a Zod contract. Slice-local error
// classes stay with the caller; this module owns transport, status, JSON, and
// contract failure.

import type { z } from 'zod';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';

/** Error constructor used by a slice to wrap every door failure. */
type ConvexHttpDoorError = new (
  message: string,
  options?: { cause?: unknown },
) => Error;

/**
 * Posts JSON to one Convex HTTP path and returns the parsed contract, or throws
 * `error` with a `label`-prefixed message.
 */
export async function postConvexHttpDoor<T>({
  path,
  body,
  schema,
  error: DoorError,
  label,
}: {
  readonly path: `/${string}`;
  readonly body: unknown;
  readonly schema: z.ZodType<T>;
  readonly error: ConvexHttpDoorError;
  readonly label: string;
}): Promise<T> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  const siteUrl = convexUrl ? deriveConvexSiteUrl(convexUrl) : null;
  if (siteUrl === null || !secret) {
    throw new DoorError(`${label}: Convex URL or service secret is unset`);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${siteUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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
