// Typed fetch for our own /api routes. Each JSON-speaking route's owning slice
// exports an endpoint contract from its api-contract.ts; callers go through
// apiFetch and get that contract's closed status-discriminated outcome back —
// raw fetch('/api/…') is lint-banned. The helper deliberately changes nothing
// on the wire: same method/headers/body bytes as the call sites it replaced.
//
// This is the browser executor. Server-to-server callers use serviceFetch in
// platform/auth; both decode through the shared core in ./decode.
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

/** Body argument inferred from whether an endpoint declares a request schema. */
export type BodyArg<TEndpoint extends EndpointContract> = TEndpoint['request'] extends null
  ? { body?: never }
  : { body: RequestInputOf<TEndpoint> };

/** Everything one call site may supply: transport options, URL input, and a request body. */
export type EndpointCallInit<TEndpoint extends EndpointContract> = CallInit &
  UrlInputOf<TEndpoint> &
  BodyArg<TEndpoint>;

/**
 * Fetch arguments inferred from whether an endpoint declares a request body, path parameters,
 * and a query schema. A request body or a `[segment]` path template makes the argument mandatory.
 */
export type EndpointCallArgs<TEndpoint extends EndpointContract> =
  TEndpoint['request'] extends null
    ? RequiresUrlInput<TEndpoint> extends true
      ? [init: EndpointCallInit<TEndpoint>]
      : [init?: EndpointCallInit<TEndpoint>]
    : [init: EndpointCallInit<TEndpoint>];

/** Calls an endpoint contract and returns its closed status-discriminated outcome. */
export async function apiFetch<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  ...args: EndpointCallArgs<TEndpoint>
): Promise<OutcomeOf<TEndpoint>> {
  const [init] = args;
  // An absent argument is only reachable for an endpoint with no body and no
  // path parameters, so the declared path is already the full URL.
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
  // params/query address the URL, not the request init — drop them from `rest`.
  const { body, params: _params, query: _query, ...rest } = init;
  return {
    ...(endpoint.request === null
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ...rest,
  };
}
