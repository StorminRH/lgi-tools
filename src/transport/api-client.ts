import { decodeEndpointResponse, networkFailure } from './decode';
import { endpointUrl } from './endpoint';
import type {
  EndpointContract,
  OutcomeOf,
  RequestInputOf,
  RequiresUrlInput,
  UrlInputOf,
} from './endpoint';

export type CallInit = Pick<RequestInit, 'signal' | 'cache' | 'keepalive'>;

export type BodyArg<TEndpoint extends EndpointContract> = TEndpoint['request'] extends null
  ? { body?: never }
  : { body: RequestInputOf<TEndpoint> };

export type EndpointCallInit<TEndpoint extends EndpointContract> = CallInit &
  UrlInputOf<TEndpoint> &
  BodyArg<TEndpoint>;

export type EndpointCallArgs<TEndpoint extends EndpointContract> =
  TEndpoint['request'] extends null
    ? RequiresUrlInput<TEndpoint> extends true
      ? [init: EndpointCallInit<TEndpoint>]
      : [init?: EndpointCallInit<TEndpoint>]
    : [init: EndpointCallInit<TEndpoint>];

export async function apiFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  ...args: EndpointCallArgs<TEndpoint>
): Promise<OutcomeOf<TEndpoint>> {
  const [init] = args;
  const url = init === undefined ? endpoint.path : endpointUrl(endpoint, init);

  let response: Response;
  try {
    response = await fetch(url, { method: endpoint.method, ...requestInit(endpoint, init) });
  } catch (cause) {
    return networkFailure(cause);
  }

  try {
    return await decodeEndpointResponse(endpoint, response);
  } catch (cause) {
    return networkFailure(cause);
  }
}

function requestInit(
  endpoint: EndpointContract,
  init: (CallInit & { body?: unknown; params?: unknown; query?: unknown }) | undefined,
): RequestInit {
  if (init === undefined) return {};
  const { body, params: _params, query: _query, ...rest } = init;
  return {
    ...(endpoint.request === null
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ...rest,
  };
}
