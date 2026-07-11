'use client';

// The saved-template row list, shared by the planner's TemplatesMenu popover and
// the /industry/templates manager page (each supplies its own <ul> chrome, this
// owns the identical row wiring so the two can't drift): load navigates to the
// template's planner page with ?plan=, and the favorite / rename / two-step
// delete route through the shared row menu.
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
