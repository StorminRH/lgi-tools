// Convex bundles this module into its isolate and rejects `next/server`.
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { decodeEndpointResponse, networkFailure } from '@/transport/decode';
import type {
  EndpointContract,
  OutcomeOf,
  RequestInputOf,
} from '@/transport/endpoint';

/** Server-to-server call context: the trusted deployment base URL and the service secret. */
export interface ServiceCallInit {
  baseUrl: string;
  secret: string;
}

/** Request body argument inferred from whether the endpoint declares a request schema. */
export type ServiceBodyArgs<TEndpoint extends EndpointContract> = TEndpoint['request'] extends null
  ? { body?: never }
  : { body: RequestInputOf<TEndpoint> };

/** Executes a first-party endpoint contract server-to-server with service auth and runtime validation. */
export async function serviceFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: ServiceCallInit & ServiceBodyArgs<TEndpoint>,
): Promise<OutcomeOf<TEndpoint>> {
  const { baseUrl, secret, body } = init;
  const bodyless = endpoint.request === null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
  };
  if (!bodyless) headers['Content-Type'] = 'application/json';
  const protectionBypass = readEnv('VERCEL_AUTOMATION_BYPASS_SECRET');
  if (protectionBypass) {
    headers['x-vercel-protection-bypass'] = protectionBypass;
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${endpoint.path}`,
      {
        method: endpoint.method,
        headers,
        ...(bodyless ? {} : { body: JSON.stringify(body) }),
      },
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
