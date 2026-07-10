'use client';

// The shared saved-plans list state (3.7.24) — one fetch + mutation surface
// for every saved-templates consumer (the planner's TemplatesMenu popover, the
// /industry dashboard's Saved section, the /industry/saved manager page).
// Every mutating endpoint echoes the full updated list in the server's order
// (favorites first, then most recently updated), so consumers re-render from
// the echo without a refetch and never re-sort. Transient row UI (which row is
// mid-rename, which delete is armed) stays in the components — this hook owns
// only the data.
import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { apiFetch, type ApiResult } from '@/lib/api-client';
import {
  deleteSavedPlanEndpoint,
  favoriteSavedPlanEndpoint,
  renameSavedPlanEndpoint,
  savedPlansEndpoint,
  type SavedPlanRow,
  type SavedPlansResponse,
} from './api-contract';
import { echoOutcome } from './saved-plans-view';

export interface SavedPlansState {
  // null = not fetched yet; [] settles for an anonymous viewer too.
  plans: SavedPlanRow[] | null;
  listFailed: boolean;
  busyId: string | null;
  refresh: () => void;
  // Shared completion for a mutating call: apply the echoed list on success,
  // otherwise surface the endpoint-specific error copy. Returns success.
  applyEcho: (
    res: ApiResult<SavedPlansResponse> | null,
    errorFor: (status: number) => string,
  ) => boolean;
  renameRow: (row: SavedPlanRow, draft: string) => void;
  favoriteRow: (row: SavedPlanRow) => void;
  deleteRow: (row: SavedPlanRow) => void;
}

export function useSavedPlans(): SavedPlansState {
  const [plans, setPlans] = useState<SavedPlanRow[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Keeps the stale list up while the read runs; a failure flags rather than
  // clears, so an open panel degrades instead of blanking. Stable identity so
  // a mount-fetch effect can depend on it.
  const refresh = useCallback(() => {
    apiFetch(savedPlansEndpoint, { cache: 'no-store' })
      .then((res) => {
        setListFailed(!res.ok);
        if (res.ok) setPlans(res.data.plans);
      })
      .catch(() => setListFailed(true));
  }, []);

  const applyEcho: SavedPlansState['applyEcho'] = (res, errorFor) => {
    const outcome = echoOutcome(res, errorFor);
    if ('error' in outcome) {
      toast.error(outcome.error);
      return false;
    }
    setPlans(outcome.plans);
    return true;
  };

  const mutateRow = (
    id: string,
    call: () => Promise<ApiResult<SavedPlansResponse>>,
    failMsg: string,
  ) => {
    setBusyId(id);
    call()
      .catch(() => null)
      .then((res) => {
        setBusyId(null);
        applyEcho(res, () => failMsg);
      });
  };

  const renameRow = (row: SavedPlanRow, draft: string) => {
    const name = draft.trim();
    if (name === '' || name === row.name) return;
    mutateRow(
      row.id,
      () => apiFetch(renameSavedPlanEndpoint, { body: { id: row.id, name } }),
      "Couldn't rename the template",
    );
  };

  const favoriteRow = (row: SavedPlanRow) => {
    mutateRow(
      row.id,
      () =>
        apiFetch(favoriteSavedPlanEndpoint, {
          body: { id: row.id, favorite: !row.favorite },
        }),
      "Couldn't update the favorite",
    );
  };

  const deleteRow = (row: SavedPlanRow) => {
    mutateRow(
      row.id,
      () => apiFetch(deleteSavedPlanEndpoint, { body: { id: row.id } }),
      "Couldn't delete the template",
    );
  };

  return { plans, listFailed, busyId, refresh, applyEcho, renameRow, favoriteRow, deleteRow };
}
