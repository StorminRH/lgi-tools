import { z } from 'zod';
import { positiveIdSchema } from './id-schemas';

// Convex bundles this module and the door modules built on it, so it imports
// zod and lib only. The Next fetch client lives in convex-http-door.ts.

/**
 * One operation on a Convex HTTP door: the path Convex routes, the body Convex
 * parses, and the reply Next parses. Operations that share a path and
 * dispatch on a discriminant are separate doors with the same `path`.
 */
export interface ConvexDoor<
  P extends `/${string}` = `/${string}`,
  Req extends z.ZodType = z.ZodType,
  Res extends z.ZodType = z.ZodType,
> {
  readonly path: P;
  readonly request: Req;
  readonly response: Res;
}

/** The body a caller sends through a door, before Convex parses it. */
export type ConvexDoorRequest<D extends ConvexDoor> = z.input<D['request']>;

/** A door's reply once its response schema has parsed it. */
export type ConvexDoorResponse<D extends ConvexDoor> = z.output<D['response']>;

/** Declares a door, keeping its path as a literal type. */
export function defineConvexDoor<
  const P extends `/${string}`,
  Req extends z.ZodType,
  Res extends z.ZodType,
>(door: ConvexDoor<P, Req, Res>): ConvexDoor<P, Req, Res> {
  return door;
}

/** The body of a per-user purge door: the user, and one character or null for all of them. */
export const purgeScopeRequestSchema = z.object({
  userId: z.string().min(1),
  characterId: positiveIdSchema.nullable(),
});
