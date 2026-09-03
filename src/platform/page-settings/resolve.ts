import type { PageSettingsSpec } from './types';

export function resolveSpecForPath(
  pathname: string,
  specs: readonly PageSettingsSpec[],
): PageSettingsSpec | null {
  if (!pathname) return null;
  let best: PageSettingsSpec | null = null;
  for (const spec of specs) {
    const { route } = spec;
    const matches = pathname === route || pathname.startsWith(`${route}/`);
    if (matches && (best === null || route.length > best.route.length)) {
      best = spec;
    }
  }
  return best;
}
