import { revalidateTag } from 'next/cache';

/**
 * Expires `tag` so the next read of it is a blocking miss, never the
 * pre-write copy. Owner-dataset writers call it once their write commits,
 * because a viewer is waiting on that data; `'max'` would serve the old entry
 * once while it regenerates. updateTag does the same but throws outside a
 * Server Action, and these writes run in route handlers, after() and crons.
 * Where the cache handler keeps tag state per instance, another instance can
 * still serve its entry until the reader's cacheLife revalidate passes.
 */
export function expireNow(tag: string): void {
  revalidateTag(tag, { expire: 0 });
}
