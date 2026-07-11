'use client';

// The transient row-UI state shared by the two saved-template surfaces (the
// planner's TemplatesMenu popover and the /industry/templates manager page): which
// row is being inline-renamed, and which is armed for the two-step delete. The
// network/favorite/echo logic already lives in useSavedPlans; this owns ONLY the
// per-row edit/arm state, so the two shells can't drift on it. No timers, no
// click-away — the delete disarms on the second press, on starting a rename, or
// when the caller resets (e.g. a popover close).
//
// Promote to `components/ui` when a third consumer appears (a non-template list
// with rename + two-step delete) — this stays planner-local until then.
import { useState } from 'react';

export interface ManagedRowMenu<Row extends { id: string }> {
  editingId: string | null;
  armedDeleteId: string | null;
  startRename: (id: string) => void;
  commitRename: (row: Row, draft: string) => void;
  requestDelete: (row: Row) => void;
  reset: () => void;
}

export function useManagedRowMenu<Row extends { id: string }>(mutations: {
  rename: (row: Row, draft: string) => void;
  remove: (row: Row) => void;
}): ManagedRowMenu<Row> {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  return {
    editingId,
    armedDeleteId,
    // Starting a rename disarms any pending delete on another row.
    startRename: (id) => {
      setArmedDeleteId(null);
      setEditingId(id);
    },
    commitRename: (row, draft) => {
      setEditingId(null);
      mutations.rename(row, draft);
    },
    // First press arms the row into "confirm?"; the second deletes and disarms.
    requestDelete: (row) => {
      if (armedDeleteId !== row.id) {
        setArmedDeleteId(row.id);
        return;
      }
      setArmedDeleteId(null);
      mutations.remove(row);
    },
    reset: () => {
      setEditingId(null);
      setArmedDeleteId(null);
    },
  };
}
