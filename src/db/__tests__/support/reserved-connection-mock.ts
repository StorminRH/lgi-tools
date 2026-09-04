import { vi } from 'vitest';
import type { Sql } from '@/db';

export function createReservedConnectionMock(
  query: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown> = () => Promise.resolve([{ got: true }]),
) {
  const reserved = Object.assign(vi.fn(query), { release: vi.fn() });
  const reserve = vi.fn((..._args: unknown[]) => Promise.resolve(reserved));
  return {
    reserved,
    reserve,
    client: { reserve } as unknown as Sql,
  };
}
