'use client';

// The /industry/templates manager island (3.7.24): every saved build template with
// load / rename / favorite / two-step delete, over the same shared hook + row
// the planner popover uses (one CRUD path — the existing endpoints; every
// mutation applies the server's echoed, favorites-first list). Load navigates
// to the template's own planner page with ?plan=, where TemplateLoader replays
// it — the ONE load mechanism. Anonymous handling is fully client-side (the
// page stays a static shell): the roster settles [] for an anonymous visitor
// (null = still loading).
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
