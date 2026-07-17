/**
 * One parsed EVE news headline. `publishedAt` is an ISO string (not a `Date`)
 * so the value crosses the `'use cache'` serialization boundary cleanly and the
 * card formats it at render time.
 */
export type EveNewsItem = {
  title: string;
  url: string;
  publishedAt: string | null;
  category: string | null;
};
