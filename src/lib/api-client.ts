// Typed fetch for our own /api routes (3.4.T). Each JSON-speaking route's
// owning slice exports an ApiEndpoint from its api-contract.ts; callers go
// through apiFetch and get the contract's response type back — raw
// fetch('/api/…') is lint-banned. The helper deliberately changes nothing on
// the wire: same method/headers/body bytes as the call sites it replaced.
import type { z } from 'zod';

export type ApiResult<TData> =
  | { ok: true; status: number; data: TData }
  // Body left unconsumed — callers branch on status and read .text() exactly
  // as they did against the raw Response.
  | { ok: false; status: number; response: Response };

export interface ApiEndpoint<TIn, TData> {
  method: 'GET' | 'POST';
  path: string;
  // The route-side request schema (the route imports the same object and does
  // the parsing, as before). apiFetch uses ONLY its input type — outgoing
  // bodies are never client-parsed. null = the endpoint takes no body.
  // Zod 4 signature: ZodType<Output, Input> — the SECOND param is the input
  // type (Zod 3 had a three-param ZodType<O, Def, I> where the second was the
  // internal typedef; this code requires the installed Zod 4, see CLAUDE.md).
  request: z.ZodType<unknown, TIn> | null;
  // Success-body schema. Outside production it safeParses the body and
  // console.errors on drift; EVERY environment returns the raw json — never
  // the Zod output, so default-object key-stripping can't make dev differ
  // from prod. null = the success body is never read (204s / ignored bodies).
  response: z.ZodType<TData> | null;
}

type CallInit = Pick<RequestInit, 'signal' | 'cache' | 'keepalive'>;

export async function apiFetch<TData>(
  endpoint: ApiEndpoint<null, TData>,
  init?: CallInit,
): Promise<ApiResult<TData>>;
export async function apiFetch<TIn, TData>(
  endpoint: ApiEndpoint<TIn, TData>,
  init: CallInit & { body: TIn },
): Promise<ApiResult<TData>>;
export async function apiFetch(
  endpoint: ApiEndpoint<unknown, unknown>,
  init: CallInit & { body?: unknown } = {},
): Promise<ApiResult<unknown>> {
  const { body, ...rest } = init;
  const res = await fetch(endpoint.path, {
    method: endpoint.method,
    ...(endpoint.request !== null
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    ...rest,
  });
  if (!res.ok) return { ok: false, status: res.status, response: res };
  if (endpoint.response === null) return { ok: true, status: res.status, data: undefined };
  const data: unknown = await res.json();
  if (process.env.NODE_ENV !== 'production') {
    const check = endpoint.response.safeParse(data);
    if (!check.success) {
      console.error(
        `[api-client] ${endpoint.method} ${endpoint.path} response drifted from its contract`,
        check.error,
      );
    }
  }
  return { ok: true, status: res.status, data };
}
