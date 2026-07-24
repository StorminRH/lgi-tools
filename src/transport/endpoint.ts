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

type EndpointResponseMap = Record<number, ResponseCodec>;

/** First-party endpoint contract owning method, path, request, and every response status. */
export interface EndpointContract<
  TRequest extends z.ZodTypeAny | null = z.ZodTypeAny | null,
  TResponses extends EndpointResponseMap = EndpointResponseMap,
> {
  method: 'GET' | 'POST';
  path: string;
  request: TRequest;
  responses: TResponses;
}

type EndpointDefinition =
  | (EndpointContract<null> & { method: 'GET'; request: null })
  | (EndpointContract & { method: 'POST' });

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

/** Preserves literal endpoint metadata while rejecting request schemas on GET contracts. */
export function defineEndpoint<const TEndpoint extends EndpointDefinition>(
  endpoint: TEndpoint,
): TEndpoint {
  return endpoint;
}

type ProblemBodyFor<TCode extends string> = Omit<ProblemBody, 'code'> & {
  code: TCode;
};

type BodyOfCodec<TCodec extends ResponseCodec> =
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

type IsSuccessStatus<TStatus extends number> =
  `${TStatus}` extends `2${string}` ? true : false;

type DeclaredOutcome<TEndpoint extends EndpointContract> = {
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
