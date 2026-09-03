'use client';

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

    startRename: (id) => {
      setArmedDeleteId(null);
      setEditingId(id);
    },
    commitRename: (row, draft) => {
      setEditingId(null);
      mutations.rename(row, draft);
    },

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
