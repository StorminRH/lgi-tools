function field(value: unknown, key: 'data' | 'code' | 'detail'): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/**
 * The `{ code, detail }` payload a Convex application error carries. The
 * check is structural, so a plain `{ data: { code } }` object decodes like a
 * real ConvexError. Anything whose `data` holds no string `code` (a plain
 * Error, a ConvexError thrown with string data) gives null, and a detail that
 * is not a string reads as null.
 */
export function readConvexError(
  error: unknown,
): { readonly code: string; readonly detail: string | null } | null {
  const data = field(error, 'data');
  const code = field(data, 'code');
  if (typeof code !== 'string') return null;
  const detail = field(data, 'detail');
  return { code, detail: typeof detail === 'string' ? detail : null };
}
