import { esiFetch, esiUrl } from '@/platform/esi';

export type UniverseNameRow = {
  readonly id: number;
  readonly name: string;
  readonly category: string | null;
};

export async function postUniverseNames(
  ids: readonly number[],
): Promise<
  { readonly ok: true; readonly data: UniverseNameRow[] } | { readonly ok: false; readonly status: number }
> {
  const res = await esiFetch(esiUrl('/universe/names/'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ids),
  });
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
