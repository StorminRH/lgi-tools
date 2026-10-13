import { readConvexError } from '@/lib/convex-error';
import { errorMessage } from '@/lib/failure';

/** The code a ConvexError carries, or the message of any other error, for logs. */
export function errorCode(error: unknown): string {
  return readConvexError(error)?.code ?? errorMessage(error);
}
