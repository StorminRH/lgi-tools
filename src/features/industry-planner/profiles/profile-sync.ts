import type { IndustryProfileRow } from './api-contract';
import { overlayPending, type PendingEdit, saveFailureMessage } from './profile-view';

export type ProfilesResult =
  | { ok: true; data: { profiles: IndustryProfileRow[] } }
  | { ok: false; status?: number };

export interface ProfileSyncState {
  profiles: IndustryProfileRow[] | null;
  listFailed: boolean;
}

export interface ProfileSync {
  refresh: () => Promise<void>;
  request: <T extends ProfilesResult>(call: () => Promise<T>) => Promise<T>;
  save: (id: string, edit: PendingEdit) => void;
}

export function createProfileSync(deps: {
  list: () => Promise<ProfilesResult>;
  update: (body: { id: string; expectedRevision: number } & PendingEdit) => Promise<ProfilesResult>;
  publish: (state: ProfileSyncState) => void;
  notify: (message: string) => void;
}): ProfileSync {
  let rows: IndustryProfileRow[] | null = null;
  const pending = new Map<string, PendingEdit & { expectedRevision: number }>();
  let listFailed = false;
  let tail: Promise<void> = Promise.resolve();

  const emit = () =>
    deps.publish({ profiles: rows === null ? null : overlayPending(rows, pending), listFailed });

  const enqueue = <T>(call: () => Promise<T>): Promise<T> => {
    const result = tail.then(call);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  const accept = (next: IndustryProfileRow[]) => {
    rows = next;
    for (const id of pending.keys()) {
      if (!next.some((row) => row.id === id)) pending.delete(id);
    }
    emit();
  };

  const read = async () => {
    const res = await deps.list();
    listFailed = !res.ok;
    if (res.ok) accept(res.data.profiles);
    else emit();
  };

  return {
    refresh: () => enqueue(read),
    request: (call) => enqueue(async () => {
      const res = await call();
      if (res.ok) accept(res.data.profiles);
      return res;
    }),
    save: (id, edit) => {
      const row = rows?.find((r) => r.id === id);
      if (row === undefined) return;
      pending.set(id, { ...edit, expectedRevision: pending.get(id)?.expectedRevision ?? row.revision });
      emit();
      void enqueue(async () => {
        const next = pending.get(id);
        if (next === undefined) return;
        const res = await deps.update({ id, ...next });
        if (!res.ok) {
          pending.delete(id);
          deps.notify(saveFailureMessage(res.status ?? 0));
          await read();
          return;
        }
        if (pending.get(id) === next) pending.delete(id);
        else {
          const queued = pending.get(id);
          if (queued?.expectedRevision === next.expectedRevision) queued.expectedRevision += 1;
        }
        accept(res.data.profiles);
      });
    },
  };
}
