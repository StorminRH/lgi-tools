import type { IndustryProfileRow } from './api-contract';
import { overlayPending, type PendingEdit, saveFailureMessage } from './profile-view';

export type ProfilesResult =
  | { ok: true; profiles: IndustryProfileRow[] }
  | { ok: false; status: number };

export interface ProfileSyncState {
  /** Server rows with queued edits laid over them; null until the first read. */
  profiles: IndustryProfileRow[] | null;
  listFailed: boolean;
}

export interface ProfileSync {
  refresh: () => Promise<void>;
  accept: (rows: IndustryProfileRow[]) => void;
  save: (id: string, edit: PendingEdit) => void;
  forget: (id: string) => void;
}

/**
 * Keeps one profile list in step with the server. Edits show at once and are
 * written one at a time per profile, each against the revision the previous
 * write returned, so quick successive edits never conflict with each other.
 * A write the server refuses drops the queued edit and reloads the list.
 */
export function createProfileSync(deps: {
  list: () => Promise<ProfilesResult>;
  update: (body: { id: string; expectedRevision: number } & PendingEdit) => Promise<ProfilesResult>;
  publish: (state: ProfileSyncState) => void;
  notify: (message: string) => void;
}): ProfileSync {
  let rows: IndustryProfileRow[] | null = null;
  let pending = new Map<string, PendingEdit>();
  let listFailed = false;
  const inflight = new Set<string>();

  const emit = () =>
    deps.publish({ profiles: rows === null ? null : overlayPending(rows, pending), listFailed });

  const setPending = (id: string, edit: PendingEdit | null) => {
    pending = new Map(pending);
    if (edit === null) pending.delete(id);
    else pending.set(id, edit);
  };

  const refresh = async () => {
    const res = await deps.list();
    listFailed = !res.ok;
    if (res.ok) rows = res.profiles;
    emit();
  };

  const flush = async (id: string): Promise<void> => {
    const edit = pending.get(id);
    const row = rows?.find((r) => r.id === id);
    if (inflight.has(id) || edit === undefined || row === undefined) return;
    inflight.add(id);
    const res = await deps.update({ id, expectedRevision: row.revision, ...edit });
    inflight.delete(id);
    if (!res.ok) {
      setPending(id, null);
      deps.notify(saveFailureMessage(res.status));
      await refresh();
      return;
    }
    if (pending.get(id) === edit) setPending(id, null);
    rows = res.profiles;
    emit();
    await flush(id);
  };

  return {
    refresh,
    accept: (next) => {
      rows = next;
      emit();
    },
    save: (id, edit) => {
      setPending(id, edit);
      emit();
      void flush(id);
    },
    forget: (id) => {
      setPending(id, null);
      emit();
    },
  };
}
