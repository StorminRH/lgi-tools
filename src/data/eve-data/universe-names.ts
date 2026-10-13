import { esiPassThrough } from '@/data/esi-store';
import type { EsiFetchOptions } from '@/platform/esi';
import { esiJsonPostInit } from '@/platform/esi/request-init';

export type UniverseNameRow = {
  readonly id: number;
  readonly name: string;
  readonly category: string | null;
};

/** One /universe/names/ POST; `opts` marks a lookup a user is waiting on. */
export async function postUniverseNames(
  ids: readonly number[],
  opts?: EsiFetchOptions,
): Promise<
  { readonly ok: true; readonly data: UniverseNameRow[] } | { readonly ok: false; readonly status: number }
> {
  const res = await esiPassThrough('/universe/names/', undefined, esiJsonPostInit(ids), opts);
  if (!res.ok) return { ok: false, status: res.status };
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('ESI /universe/names/ response was malformed');
  return { ok: true, data: parseUniverseNameRows(data) };
}

function parseUniverseNameRows(data: readonly unknown[]): UniverseNameRow[] {
  const rows: UniverseNameRow[] = [];
  for (const candidate of data) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      !('id' in candidate) ||
      typeof candidate.id !== 'number' ||
      !('name' in candidate) ||
      typeof candidate.name !== 'string'
    ) {
      continue;
    }
    rows.push({
      id: candidate.id,
      name: candidate.name,
      category:
        'category' in candidate && typeof candidate.category === 'string'
          ? candidate.category
          : null,
    });
  }
  return rows;
}
