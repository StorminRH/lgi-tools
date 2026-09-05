import { vercelProtectionBypassHeaders } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { decodeEndpointResponse, networkFailure } from '@/transport/decode';
import type {
  EndpointContract,
  OutcomeOf,
  RequestInputOf,
} from '@/transport/endpoint';

export interface ServiceCallInit {
  baseUrl: string;
  secret: string;
}

export type ServiceBodyArgs<TEndpoint extends EndpointContract> = TEndpoint['request'] extends null
  ? { body?: never }
  : { body: RequestInputOf<TEndpoint> };

export async function serviceFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  init: ServiceCallInit & ServiceBodyArgs<TEndpoint>,
): Promise<OutcomeOf<TEndpoint>> {
  const { baseUrl, secret, body } = init;
  const bodyless = endpoint.request === null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    ...vercelProtectionBypassHeaders(),
  };
  if (!bodyless) headers['Content-Type'] = 'application/json';

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
