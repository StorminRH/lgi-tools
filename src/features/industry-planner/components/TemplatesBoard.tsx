'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiTile, SectionPanel } from '@/components/ui/readout';
import { SheetHeading, SheetLayout } from '@/components/ui/sheet-layout';
import { useAccountCharacters } from '@/components/use-account-characters';
import type { SavedPlanRow } from '../api-contract';
import { savedPlansViewState } from '../saved-plans-view';
import { useManagedRowMenu } from '../use-managed-row-menu';
import { useSavedPlans } from '../use-saved-plans';
import { SavedPlanRows } from './SavedPlanRows';

function count(plans: readonly SavedPlanRow[] | null, keep: (row: SavedPlanRow) => boolean = () => true) {
  return plans === null ? '…' : plans.filter(keep).length;
}

export function TemplatesBoard() {
  const roster = useAccountCharacters();
  const { plans, listFailed, busyId, refresh, renameRow, favoriteRow, deleteRow } =
    useSavedPlans();
  const menu = useManagedRowMenu({ rename: renameRow, remove: deleteRow });

  useEffect(() => {
    refresh();
  }, [refresh]);

  const state = savedPlansViewState(plans, roster, listFailed);

  return (
    <SheetLayout
      aside={
        <>
          <SheetHeading title="Templates">
            Saved build setups: runs, location, build character and ME/TE. Load one to reopen its plan.
          </SheetHeading>
          <dl className="grid grid-cols-2 gap-2">
            <KpiTile label="Saved" tone="text-isk">{count(plans)}</KpiTile>
            <KpiTile label="Favorites">{count(plans, (row) => row.favorite)}</KpiTile>
          </dl>
          <Link href="/industry/plan" className="text-ui text-isk no-underline hover:text-name">
            Start a new plan →
          </Link>
        </>
      }
    >
      <SectionPanel title="Saved templates">
        {state.kind === 'list' ? (
          <ul className="flex flex-col gap-1.5 p-3.5">
            <SavedPlanRows plans={plans ?? []} busyId={busyId} menu={menu} favoriteRow={favoriteRow} />
          </ul>
        ) : (
          <EmptyState>{state.kind === 'empty' ? state.line : ' '}</EmptyState>
        )}
      </SectionPanel>
    </SheetLayout>
  );
}
