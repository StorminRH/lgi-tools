import { vercelProtectionBypassHeaders } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { BodyArg } from '@/transport/api-client';
import { decodeEndpointResponse, networkFailure } from '@/transport/decode';
import {
  endpointUrl,
  type EndpointContract,
  type OutcomeOf,
  type UrlInputOf,
} from '@/transport/endpoint';

export interface AppCallInit {
  baseUrl: string;
  timeoutMs?: number;
}

export type AppCallArgs<TEndpoint extends EndpointContract> = AppCallInit &
  UrlInputOf<TEndpoint> &
  BodyArg<TEndpoint>;

async function callApp<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: AppCallArgs<TEndpoint>,
  authHeaders: Record<string, string>,
): Promise<OutcomeOf<TEndpoint>> {
  const bodyless = endpoint.request === null;
  const headers: Record<string, string> = {
    ...authHeaders,
    ...vercelProtectionBypassHeaders(),
  };
  if (!bodyless) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${init.baseUrl}${endpointUrl(endpoint, init)}`,
      {
        method: endpoint.method,
        headers,
        ...(bodyless ? {} : { body: JSON.stringify(init.body) }),
      },
      init.timeoutMs,
    );
  } catch (cause) {
    return networkFailure(cause);
  }

  try {
    return await decodeEndpointResponse(endpoint, response);
  } catch (cause) {
    return networkFailure(cause);
  }
}

/**
 * Calls a first-party route from Convex without service auth. The Vercel
 * protection bypass header is still sent when configured. `baseUrl` is an
 * origin with no trailing slash.
 */
export function appFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: AppCallArgs<TEndpoint>,
): Promise<OutcomeOf<TEndpoint>> {
  return callApp(endpoint, init, {});
}

/** Same as appFetch, plus `Authorization: Bearer <secret>`. */
export function serviceFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: AppCallArgs<TEndpoint> & { secret: string },
): Promise<OutcomeOf<TEndpoint>> {
  return callApp(endpoint, init, { Authorization: `Bearer ${init.secret}` });
}
