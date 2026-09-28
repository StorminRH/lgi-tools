import { AsyncLocalStorage } from 'node:async_hooks';

type MergeBox = { merged: boolean };

const mergeStore = new AsyncLocalStorage<MergeBox>();

export async function runWithMergeTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; merged: boolean }> {
  const box: MergeBox = { merged: false };
  const result = await mergeStore.run(box, fn);
  return { result, merged: box.merged };
}

export function recordMerge(): void {
  const box = mergeStore.getStore();
  if (box) box.merged = true;
}
