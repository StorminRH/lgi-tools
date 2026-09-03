'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/transport/api-client';
import {
  deleteSavedPlanEndpoint,
  favoriteSavedPlanEndpoint,
  renameSavedPlanEndpoint,
  savedPlansEndpoint,
  type SavedPlanRow,
} from './api-contract';
import { echoOutcome, type SavedPlansEchoResult } from './saved-plans-view';

export interface SavedPlansState {

  plans: SavedPlanRow[] | null;
  listFailed: boolean;
  busyId: string | null;
  refresh: () => void;

  applyEcho: (
    res: SavedPlansEchoResult | null,
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

  const echoSeq = useRef(0);

  const refresh = useCallback(() => {
    const seqAtStart = echoSeq.current;
    apiFetch(savedPlansEndpoint, { cache: 'no-store' })
      .then((res) => {
        if (echoSeq.current !== seqAtStart) return;
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
    echoSeq.current += 1;
    setPlans(outcome.plans);
    return true;
  };

  const mutateRow = (
    id: string,
    call: () => Promise<SavedPlansEchoResult>,
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
