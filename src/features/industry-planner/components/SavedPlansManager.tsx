'use client';

import { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useAccountCharacters } from '@/components/use-account-characters';
import { savedPlansViewState } from '../saved-plans-view';
import { useManagedRowMenu } from '../use-managed-row-menu';
import { useSavedPlans } from '../use-saved-plans';
import { SavedPlanRows } from './SavedPlanRows';

export function SavedPlansManager() {
  const roster = useAccountCharacters();
  const { plans, listFailed, busyId, refresh, renameRow, favoriteRow, deleteRow } =
    useSavedPlans();
  const menu = useManagedRowMenu({ rename: renameRow, remove: deleteRow });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const state = savedPlansViewState(plans, roster, listFailed);
  if (state.kind === 'blank') {
    return (
      <Card>
        <EmptyState> </EmptyState>

      </Card>

    );
  }
  if (state.kind === 'empty') {
    return (
      <Card>
        <EmptyState>{state.line}</EmptyState>

      </Card>

    );
  }

  return (
    <Card>
      <ul className="flex flex-col gap-1.5 p-3.5">
        <SavedPlanRows plans={plans ?? []} busyId={busyId} menu={menu} favoriteRow={favoriteRow} />
      </ul>

    </Card>

  );
}
