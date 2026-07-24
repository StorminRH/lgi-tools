// Server-to-server executor for first-party endpoint contracts (3.10.2.1.3).
// The browser client (src/transport/api-client.ts) fetches same-origin relative
// paths with cookie auth; a Convex action has neither an origin nor a session,
// so it needs the deployment base URL and the service secret instead. Both
// executors decode through the same core, so a declared status means the same
// thing on either side of the wire.
//
// This module lives in platform/auth (not transport) because the Convex zone
// may import platform/auth but not transport, and the contracts it executes
// already live in this slice. Keep it free of `next/server` — Convex bundles
// this chain into its isolate.
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { decodeEndpointResponse, networkFailure } from '@/transport/decode';
import type {
  EndpointContract,
  OutcomeOf,
  RequestInputOf,
} from '@/transport/endpoint';

/** Server-to-server call context: the trusted deployment base URL and the service secret. */
interface ServiceCallInit {
  baseUrl: string;
  secret: string;
}

/** Request body argument inferred from whether the endpoint declares a request schema. */
type ServiceBodyArgs<TEndpoint extends EndpointContract> = TEndpoint['request'] extends null
  ? { body?: never }
  : { body: RequestInputOf<TEndpoint> };

/** Executes a first-party endpoint contract server-to-server with service auth and runtime validation. */
export async function serviceFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: ServiceCallInit & ServiceBodyArgs<TEndpoint>,
): Promise<OutcomeOf<TEndpoint>> {
  const { baseUrl, secret, body } = init;
  const bodyless = endpoint.request === null;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${baseUrl}${endpoint.path}`,
      {
        method: endpoint.method,
        headers: {
          ...(bodyless ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${secret}`,
        },
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
