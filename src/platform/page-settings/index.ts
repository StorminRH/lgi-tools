import { resolveSpecForPath } from './resolve';
import type { PageSettingsSpec } from './types';

const specs: PageSettingsSpec[] = [];

export function registerPageSettings(spec: PageSettingsSpec): void {
  specs.push(spec);
}

export function listPageSettings(): readonly PageSettingsSpec[] {
  return specs;
}

export function resolvePageSettings(pathname: string): PageSettingsSpec | null {
  return resolveSpecForPath(pathname, specs);
}

export function __resetPageSettings(): void {
  specs.length = 0;
}
