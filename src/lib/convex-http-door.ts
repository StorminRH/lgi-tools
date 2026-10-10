import type { z } from 'zod';
import { resolveConvexServiceDoor } from '@/lib/convex-service-door';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

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
