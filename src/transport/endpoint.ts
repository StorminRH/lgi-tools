import type { z } from 'zod';
import type { ProblemBody } from '@/lib/problem';

export interface JsonCodec<T> {
  kind: 'json';
  schema: z.ZodType<T, T>;
}

/** RFC 9457 problem codec with an optional closed application-code vocabulary. */
export interface ProblemCodec<TCode extends string = string> {
  kind: 'problem';
  codes: readonly TCode[];
}

export interface EmptyCodec {
  kind: 'empty';
}

export interface TextCodec {
  kind: 'text';
}

export type ResponseCodec =
  | JsonCodec<unknown>
  | ProblemCodec
  | EmptyCodec
  | TextCodec;

export type EndpointResponseMap = Record<number, ResponseCodec>;

export interface EndpointContract<
  TRequest extends z.ZodTypeAny | null = z.ZodTypeAny | null,
  TResponses extends EndpointResponseMap = EndpointResponseMap,
> {
  method: 'GET' | 'POST';
  path: string;
  request: TRequest;
  responses: TResponses;
  query?: z.ZodObject;
  params?: z.ZodObject;
}

export type EndpointDefinition =
  | (EndpointContract<null> & { method: 'GET'; request: null })
  | (EndpointContract & { method: 'POST' });

export type PathParamKeys<TPath extends string> =
  TPath extends `${string}[${infer TKey}]${infer TRest}`
    ? TKey | PathParamKeys<TRest>
    : never;

export type ParamsKeysOf<TEndpoint> = TEndpoint extends { params: z.ZodObject<infer TShape> }
  ? keyof TShape & string
  : never;

export type PathParamsBinding<TEndpoint extends EndpointContract> =
  PathParamKeys<TEndpoint['path']> extends ParamsKeysOf<TEndpoint>
    ? ParamsKeysOf<TEndpoint> extends PathParamKeys<TEndpoint['path']>
      ? unknown
      : { params: 'declares a key this path template does not contain' }
    : { params: 'a [segment] in this path template needs a matching params key' };

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

export function emptyBody(): EmptyCodec {
  return { kind: 'empty' };
}

export function textBody(): TextCodec {
  return { kind: 'text' };
}

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

export type DeclaredStatus<TEndpoint extends EndpointContract> =
  keyof TEndpoint['responses'] & number;

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

export type UrlInputOf<TEndpoint extends EndpointContract> = PathParamsOf<TEndpoint> &
  QueryInputOf<TEndpoint>;

export type RequiresUrlInput<TEndpoint extends EndpointContract> =
  [PathParamKeys<TEndpoint['path']>] extends [never] ? false : true;

export function endpointUrl<const TEndpoint extends EndpointContract>(
  endpoint: TEndpoint,
  input: UrlInputOf<TEndpoint>,
): string;
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
