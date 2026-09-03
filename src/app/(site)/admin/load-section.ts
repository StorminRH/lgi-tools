import { unstable_rethrow } from 'next/navigation';

export const SECTION_LOAD_FAILED = Symbol('admin.section-load-failed');

export async function loadSection<T>(
  label: string,
  load: () => Promise<T>,
): Promise<T | typeof SECTION_LOAD_FAILED> {
  try {
    return await load();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[admin] ${label} section unavailable`, err);
    return SECTION_LOAD_FAILED;
  }
}
