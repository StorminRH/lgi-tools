import { longestSectionMatch } from '@/lib/section-path';
import type { PageSettingsSpec } from './types';

export function resolveSpecForPath(
  pathname: string,
  specs: readonly PageSettingsSpec[],
): PageSettingsSpec | null {
  // sectionMatches reads '' as '/', which would match a root route.
  if (!pathname) return null;
  return longestSectionMatch(pathname, specs, (spec) => spec.route);
}
