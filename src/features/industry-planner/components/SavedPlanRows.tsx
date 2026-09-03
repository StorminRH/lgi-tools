'use client';

import { useRouter } from 'next/navigation';
import type { SavedPlanRow } from '../api-contract';
import type { ManagedRowMenu } from '../use-managed-row-menu';
import { SavedPlanRowItem } from './SavedPlanRowItem';

export function SavedPlanRows({
  plans,
  busyId,
  menu,
  favoriteRow,
}: {
  plans: SavedPlanRow[];
  busyId: string | null;
  menu: ManagedRowMenu<SavedPlanRow>;
  favoriteRow: (row: SavedPlanRow) => void;
}) {
  const router = useRouter();
  return (
    <>
      {plans.map((row) => (
        <SavedPlanRowItem
          key={`${row.id}:${row.name}`}
          row={row}
          busy={busyId === row.id}
          armed={menu.armedDeleteId === row.id}
          editing={menu.editingId === row.id}
          onLoad={() => router.push(`/industry/${row.blueprintTypeId}?plan=${row.id}`)}
          onFavorite={() => favoriteRow(row)}
          onStartRename={() => menu.startRename(row.id)}
          onCommitRename={(draft) => menu.commitRename(row, draft)}
          onDelete={() => menu.requestDelete(row)}
        />
      ))}
    </>

  );
}
