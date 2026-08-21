import type { z } from 'zod';
import type { ProblemBody } from '@/lib/problem';

/** JSON wire codec whose input and output types are deliberately identical. */
export interface JsonCodec<T> {
  kind: 'json';
  schema: z.ZodType<T, T>;
}

/** RFC 9457 problem codec with an optional closed application-code vocabulary. */
export interface ProblemCodec<TCode extends string = string> {
  kind: 'problem';
  codes: readonly TCode[];
}

/** Deliberately bodyless response codec for statuses such as 204. */
export interface EmptyCodec {
  kind: 'empty';
}

/** Plain-text response codec for endpoints whose wire contract is text. */
export interface TextCodec {
  kind: 'text';
}

/** Supported response codecs for first-party endpoint contracts. */
export type ResponseCodec =
  | JsonCodec<unknown>
  | ProblemCodec
  | EmptyCodec
  | TextCodec;

export type EndpointResponseMap = Record<number, ResponseCodec>;

/** First-party endpoint contract owning method, path, request, and every response status. */
export interface EndpointContract<
  TRequest extends z.ZodTypeAny | null = z.ZodTypeAny | null,
  TResponses extends EndpointResponseMap = EndpointResponseMap,
> {
  method: 'GET' | 'POST';
  path: string;
  request: TRequest;
  responses: TResponses;
  /** Query-parameter schema slot; keys own the wire parameter names. */
  query?: z.ZodObject;
  /** Path-parameter schema slot bound to the path template's [segments]. */
  params?: z.ZodObject;
}

export type EndpointDefinition =
  | (EndpointContract<null> & { method: 'GET'; request: null })
  | (EndpointContract & { method: 'POST' });

/** The `[segment]` names a path template declares, as a union of literal keys. */
export type PathParamKeys<TPath extends string> =
  TPath extends `${string}[${infer TKey}]${infer TRest}`
    ? TKey | PathParamKeys<TRest>
    : never;

export type ParamsKeysOf<TEndpoint> = TEndpoint extends { params: z.ZodObject<infer TShape> }
  ? keyof TShape & string
  : never;

/**
 * Binds a path template's `[segment]` names to its `params` schema keys in both
 * directions, so a dynamic path without a matching schema — or a schema key the
 * path never uses — fails to compile at the declaration site.
 */
export type PathParamsBinding<TEndpoint extends EndpointContract> =
  PathParamKeys<TEndpoint['path']> extends ParamsKeysOf<TEndpoint>
    ? ParamsKeysOf<TEndpoint> extends PathParamKeys<TEndpoint['path']>
      ? unknown
      : { params: 'declares a key this path template does not contain' }
    : { params: 'a [segment] in this path template needs a matching params key' };

/** Declares a non-transforming JSON response codec. */
export function jsonBody<T>(schema: z.ZodType<T, T>): JsonCodec<T> {
  return { kind: 'json', schema };
}

/** Declares an open-vocabulary RFC 9457 problem response codec. */
export function problem(): ProblemCodec<string>;
/** Declares an RFC 9457 problem response codec narrowed to the supplied stable codes. */
export function problem<const TCode extends string>(
  ...codes: readonly TCode[]
): ProblemCodec<TCode>;
export function problem(...codes: readonly string[]): ProblemCodec<string> {
  return { kind: 'problem', codes };
}

/** Declares a response that must carry no body. */
export function emptyBody(): EmptyCodec {
  return { kind: 'empty' };
}

/** Declares a plain-text response body. */
export function textBody(): TextCodec {
  return { kind: 'text' };
}

/**
 * Preserves literal endpoint metadata while rejecting request schemas on GET contracts and
 * path templates whose `[segment]` names and `params` schema keys disagree.
 */
export function defineEndpoint<const TEndpoint extends EndpointDefinition>(
  endpoint: TEndpoint & PathParamsBinding<TEndpoint>,
): TEndpoint {
  return endpoint;
}

export type ProblemBodyFor<TCode extends string> = Omit<ProblemBody, 'code'> & {
  code: TCode;
};

export type BodyOfCodec<TCodec extends ResponseCodec> =
  TCodec extends JsonCodec<infer TBody>
    ? TBody
    : TCodec extends ProblemCodec<infer TCode>
      ? ProblemBodyFor<TCode>
      : TCodec extends TextCodec
        ? string
        : undefined;

/** Numeric status literals declared by one endpoint. */
export type DeclaredStatus<TEndpoint extends EndpointContract> =
  keyof TEndpoint['responses'] & number;

/** Exact wire body type declared for one endpoint status. */
export type ResponseBodyFor<
  TEndpoint extends EndpointContract,
  TStatus extends DeclaredStatus<TEndpoint>,
> = BodyOfCodec<TEndpoint['responses'][TStatus]>;

export type IsSuccessStatus<TStatus extends number> =
  `${TStatus}` extends `2${string}` ? true : false;

export type DeclaredOutcome<TEndpoint extends EndpointContract> = {
  [TStatus in DeclaredStatus<TEndpoint>]: IsSuccessStatus<TStatus> extends true
    ? {
        ok: true;
        status: TStatus;
        data: ResponseBodyFor<TEndpoint, TStatus>;
      }
    : {
        ok: false;
        kind: 'api';
        status: TStatus;
        error: ResponseBodyFor<TEndpoint, TStatus>;
      };
}[DeclaredStatus<TEndpoint>];

/** Closed client outcome for every declared status plus protocol and network failures. */
export type OutcomeOf<TEndpoint extends EndpointContract> =
  | DeclaredOutcome<TEndpoint>
  | {
      ok: false;
      kind: 'protocol';
      status: number;
      detail: string;
    }
  | {
      ok: false;
      kind: 'network';
      aborted: boolean;
      cause: unknown;
    };

/** Request input inferred from an endpoint's request schema, or never when bodyless. */
export type RequestInputOf<TEndpoint extends EndpointContract> =
  TEndpoint['request'] extends z.ZodTypeAny
    ? z.input<TEndpoint['request']>
    : never;

export type PathParamsOf<TEndpoint extends EndpointContract> =
  [PathParamKeys<TEndpoint['path']>] extends [never]
    ? { params?: never }
    : { params: Record<PathParamKeys<TEndpoint['path']>, string | number> };

export type QueryInputOf<TEndpoint extends EndpointContract> =
  TEndpoint['query'] extends z.ZodObject
    ? { query?: z.input<TEndpoint['query']> }
    : { query?: never };

/** URL-building input for one endpoint: its path parameters and its declared query values. */
export type UrlInputOf<TEndpoint extends EndpointContract> = PathParamsOf<TEndpoint> &
  QueryInputOf<TEndpoint>;

/** True when an endpoint's path template requires caller-supplied parameters. */
export type RequiresUrlInput<TEndpoint extends EndpointContract> =
  [PathParamKeys<TEndpoint['path']>] extends [never] ? false : true;

/** Builds the concrete request URL from an endpoint's declared path, params, and query. */
export function endpointUrl<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  input: UrlInputOf<TEndpoint>,
): string;
// The implementation is contract-generic: the signature above proves the caller
// supplied exactly the declared parameters, so the body reads them positionally.
export function endpointUrl(
  endpoint: EndpointContract,
  input: { params?: Record<string, string | number>; query?: Record<string, unknown> },
): string {
  const path = endpoint.path.replace(/\[([^\]]+)\]/g, (_match, key: string) =>
    encodeURIComponent(String(input.params?.[key])),
  );

  const search = new URLSearchParams();
  for (const key of Object.keys(endpoint.query?.shape ?? {})) {
    const value = input.query?.[key];
    if (value !== undefined) search.set(key, String(value));
  }

  const suffix = search.toString();
  return suffix.length > 0 ? `${path}?${suffix}` : path;
}

/** Parses request query parameters through an endpoint's declared query schema. */
export function parseQueryInput<const TSchema extends z.ZodObject>(
  endpoint: EndpointContract & { query: TSchema },
  searchParams: URLSearchParams,
): z.ZodSafeParseResult<z.output<TSchema>> {
  const input: Record<string, string | undefined> = {};
  for (const key of Object.keys(endpoint.query.shape)) {
    input[key] = searchParams.get(key) ?? undefined;
  }
  return endpoint.query.safeParse(input);
}
