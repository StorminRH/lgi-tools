import type { DevlogNavModel } from '../types';

// The dev-log document highlighted for a given URL, or null when the path isn't a
// dev-log document route. The two slug-less routes (/devlog and /devlog/) resolve
// to the intro — the first loose document; /devlog/<slug> resolves to that slug.
export function deriveActiveSlug(pathname: string, model: DevlogNavModel): string | null {
  const match = pathname.match(/^\/devlog(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return match[1] ?? model.looseDocuments[0]?.slug ?? null;
}
