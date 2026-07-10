'use client';

// The /industry/templates manager island (3.7.24): every saved build template with
// load / rename / favorite / two-step delete, over the same shared hook + row
// the planner popover uses (one CRUD path — the existing endpoints; every
// mutation applies the server's echoed, favorites-first list). Load navigates
// to the template's own planner page with ?plan=, where TemplateLoader replays
// it — the ONE load mechanism. Anonymous handling is fully client-side (the
// page stays a static shell): the roster settles [] for an anonymous visitor
// (null = still loading).
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useAccountCharacters } from '@/components/use-account-characters';
import type { SavedPlanRow } from '../api-contract';
import { savedEmptyLine } from '../saved-plans-view';
import { useSavedPlans } from '../use-saved-plans';
import { SavedPlanRowItem } from './SavedPlanRowItem';

export function SavedPlansManager() {
  const router = useRouter();
  const roster = useAccountCharacters();
  const { plans, listFailed, busyId, refresh, renameRow, favoriteRow, deleteRow } =
    useSavedPlans();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const commitRename = (row: SavedPlanRow, draft: string) => {
    setEditingId(null);
    renameRow(row, draft);
  };

  const onDelete = (row: SavedPlanRow) => {
    if (armedDeleteId !== row.id) {
      setArmedDeleteId(row.id);
      return;
    }
    setArmedDeleteId(null);
    deleteRow(row);
  };

  const signedOut = roster !== null && roster.length === 0;
  const settledEmpty = plans !== null && plans.length === 0;

  if (plans === null || (settledEmpty && !listFailed && roster === null)) {
    return (
      <Card>
        <EmptyState> </EmptyState>
      </Card>
    );
  }

  if (listFailed || signedOut || settledEmpty) {
    return (
      <Card>
        <EmptyState>{savedEmptyLine({ listFailed, signedOut })}</EmptyState>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="flex flex-col gap-1.5 p-3.5">
        {plans.map((row) => (
          <SavedPlanRowItem
            key={`${row.id}:${row.name}`}
            row={row}
            busy={busyId === row.id}
            armed={armedDeleteId === row.id}
            editing={editingId === row.id}
            onLoad={() => router.push(`/industry/${row.blueprintTypeId}?plan=${row.id}`)}
            onFavorite={() => favoriteRow(row)}
            onStartRename={() => {
              setArmedDeleteId(null);
              setEditingId(row.id);
            }}
            onCommitRename={(draft) => commitRename(row, draft)}
            onDelete={() => onDelete(row)}
          />
        ))}
      </ul>
    </Card>
  );
}
