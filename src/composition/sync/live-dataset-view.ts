import { after } from 'next/server';
import { type EsiStoreKey, isDue } from '@/data/esi-store';
import { getTypeNameRecord } from '@/data/eve-data/queries';
import { listLinkedCharacters } from '@/platform/auth/linked-characters';
import type { EnumeratedOwner } from '@/platform/owner-sync';
import { listCharactersWithHealth } from './owner-sync-port';

export interface OwnerRow {
  id: number;
  lastRefreshedAt: Date | null;
  syncError?: string | null;
}

export interface LiveDatasetView<TData, TRow> {
  read(userId: string): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }>;
  refresh(userId: string): void | Promise<unknown>;
  /** The stored answers `refresh` would check for these characters: expired ones make the response say `refreshing`. */
  dueKeys(userId: string, owners: readonly EnumeratedOwner[]): EsiStoreKey[];
  makeRow(owner: OwnerRow, data: TData | null): TRow;
  nameIds(rows: TRow[]): Iterable<number>;
}

export async function readCharacterOwners<TData>(
  userId: string,
  readData: (characterIds: number[]) => Promise<Map<number, TData>>,
  readStates: (characterIds: number[]) => Promise<ReadonlyMap<number, { lastRefreshedAt: Date | null }>>,
): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }> {
  const linked = await listLinkedCharacters(userId);
  const ids = linked.map((character) => character.characterId);
  const [data, states] = await Promise.all([readData(ids), readStates(ids)]);
  const owners: OwnerRow[] = ids.map((id) => ({ id, lastRefreshedAt: states.get(id)?.lastRefreshedAt ?? null }));
  return { owners, data };
}

export function characterRow<TData>(
  owner: OwnerRow,
  data: TData | null,
): { characterId: number; data: TData | null; lastRefreshedAt: number | null } {
  return { characterId: owner.id, data, lastRefreshedAt: owner.lastRefreshedAt?.getTime() ?? null };
}

/**
 * Whether the after() refresh will reach ESI: some owner the sync would act
 * for has a stored answer CCP's Expires no longer covers. The response says
 * `refreshing` from it, so the page checks back for the newer data instead
 * of keeping the stored copy it was handed.
 */
export async function refreshDue(
  userId: string,
  dueKeys: (owners: readonly EnumeratedOwner[]) => EsiStoreKey[],
): Promise<boolean> {
  return isDue(dueKeys(await listCharactersWithHealth(userId)));
}

export async function getLiveDatasetOnView<TData, TRow>(
  userId: string,
  view: LiveDatasetView<TData, TRow>,
): Promise<{ rows: TRow[]; names: Record<string, string>; refreshing: boolean }> {
  const [{ owners, data }, refreshing] = await Promise.all([
    view.read(userId),
    refreshDue(userId, (characters) => view.dueKeys(userId, characters)),
  ]);
  after(() => view.refresh(userId));

  const rows = owners.map((owner) => view.makeRow(owner, data.get(owner.id) ?? null));

  return { rows, names: await getTypeNameRecord(view.nameIds(rows)), refreshing };
}
