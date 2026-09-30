import { ConvexError } from 'convex/values';

/** The code a ConvexError carries, or the message of any other error, for logs. */
export function errorCode(error: unknown): string {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.message : String(error);
}
