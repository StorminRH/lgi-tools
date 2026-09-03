import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';

export interface OwnerRow {
  id: number;
  lastRefreshedAt: Date | null;
  syncError?: string | null;
}

export interface LiveDatasetView<TData, TRow> {

  read(userId: string): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }>;

  refresh(userId: string): void | Promise<unknown>;

  makeRow(owner: OwnerRow, data: TData | null): TRow;

  nameIds(rows: TRow[]): Iterable<number>;
}

export async function readCharacterOwners<TData>(
  userId: string,
  readData: (characterIds: number[]) => Promise<Map<number, TData>>,
  readState: (characterId: number) => Promise<{ lastRefreshedAt: Date | null } | null>,
): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }> {
  const linked = await listLinkedCharacters(userId);
  const ids = linked.map((character) => character.characterId);
  const [data, states] = await Promise.all([
    readData(ids),
    Promise.all(ids.map((id) => readState(id))),
  ]);
  const owners: OwnerRow[] = ids.map((id, i) => ({ id, lastRefreshedAt: states[i]?.lastRefreshedAt ?? null }));
  return { owners, data };
}

export function characterRow<TData>(
  owner: OwnerRow,
  data: TData | null,
): { characterId: number; data: TData | null; lastRefreshedAt: number | null } {
  return { characterId: owner.id, data, lastRefreshedAt: owner.lastRefreshedAt?.getTime() ?? null };
}

export async function getLiveDatasetOnView<TData, TRow>(
  userId: string,
  view: LiveDatasetView<TData, TRow>,
): Promise<{ rows: TRow[]; names: Record<string, string> }> {
  const { owners, data } = await view.read(userId);
  after(() => view.refresh(userId));

  const rows = owners.map((owner) => view.makeRow(owner, data.get(owner.id) ?? null));

  const nameMap = await getTypeNames([...new Set(view.nameIds(rows))]);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) names[String(id)] = name;

  return { rows, names };
}
