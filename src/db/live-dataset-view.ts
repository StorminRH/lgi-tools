// The shared on-view seam for the live-tracker composition layers (Family-1
// generalization). The per-character (jobs, skills) and per-corp (corp jobs) sync
// wrappers all run the same tail: enumerate the owners + their sync state, read the
// cached data, fire a stale-gated write-behind refresh behind the response, build the
// per-owner wire rows, and resolve the referenced type names from the SDE in one pass.
// This factors that tail — and the character-owner parallel read — into one place; each
// wrapper supplies its own read/refresh/row/name-id knobs. It lives in src/db (the
// unconstrained composition layer) because it touches the auth slice (character
// enumeration) and the SDE name resolver — a cross-slice join the feature boundary
// forbids inside a slice.
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { listLinkedCharacters } from '@/features/auth/queries';

// One owner to render: its id (character or corporation), the staleness stamp, and the
// optional graceful error state (corp jobs' needs_role; absent for the character slices).
export interface OwnerRow {
  id: number;
  lastRefreshedAt: Date | null;
  syncError?: string | null;
}

// The per-dataset knobs the shared seam runs over. TData is the slice's cached payload;
// TRow is the slice's wire row (ViewerJobs / ViewerSkills / ViewerCorpJobs).
export interface LiveDatasetView<TData, TRow> {
  // Resolve the owners to render (with sync state) AND their cached data map. The slice
  // owns the read ordering: character slices parallelize data + per-id state
  // (readCharacterOwners); the corp slice's single sync-rows read IS the enumeration.
  read(userId: string): Promise<{ owners: OwnerRow[]; data: Map<number, TData> }>;
  // The stale-gated write-behind, fired via after() — never awaited on the response path.
  refresh(userId: string): void | Promise<unknown>;
  // Build one owner's wire row from its state + cached payload (null until first sync).
  makeRow(owner: OwnerRow, data: TData | null): TRow;
  // The type/skill ids the built rows reference, for the one SDE name pass.
  nameIds(rows: TRow[]): Iterable<number>;
}

// The character-owner read: enumerate the user's linked characters, then read their
// cached data + uncached per-character sync state IN PARALLEL (the character-slice hot
// path — the data read and the N state reads overlap, as before the generalization).
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

// The shared character wire row ({ characterId, data, lastRefreshedAt-as-epoch-ms }) —
// jobs and skills build the identical shape, so it lives here rather than cloning per
// slice. The absolute stamp is exposed as epoch ms, the shape the client "as of" reads.
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
