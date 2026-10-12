import type { z } from 'zod';
import { validationFailure, type FailureResult } from '@/lib/failure';

export type ParsedFormBody<T> =
  | { ok: true; data: T }
  | FailureResult;

export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | (FailureResult & { zodError?: z.ZodError });

export async function readJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ReadJsonBodyResult<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      failure: validationFailure('invalid_json', 'Invalid JSON'),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue
      ? `${issue.path.join('.') || 'body'}: ${issue.message}`
      : 'invalid body';
    return {
      ok: false,
      failure: validationFailure('invalid_body', detail),
      zodError: parsed.error,
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Parses a browser form post: reads only `fields`, passes a missing field as
 * undefined (as parseQueryInput does), and owns both form failures.
 */
export async function parseFormBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  fields: readonly (keyof z.input<S> & string)[],
): Promise<ParsedFormBody<z.infer<S>>> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      failure: validationFailure('invalid_form', 'Invalid form body'),
    };
  }

  const input = Object.fromEntries(
    fields.map((field) => [field, form.get(field) ?? undefined]),
  );
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join('.');
    return {
      ok: false,
      failure: validationFailure('invalid_form_field', `Invalid ${path || 'form'}`),
    };
  }
  return { ok: true, data: parsed.data };
}
