import { readOr } from '../read-or';

export const SECTION_LOAD_FAILED = Symbol('admin.section-load-failed');

export function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<T | typeof SECTION_LOAD_FAILED> {
  return readOr(`[admin] ${label} section unavailable`, load, SECTION_LOAD_FAILED);
}
