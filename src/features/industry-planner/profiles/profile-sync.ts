import type { IndustryProfileRow } from './api-contract';
import { overlayPending, type PendingEdit, saveFailureMessage } from './profile-view';

export type ProfilesResult =
  | { ok: true; data: { profiles: IndustryProfileRow[] } }
  // The server's reason, when it refused the call rather than failing to answer.
  | { ok: false; error?: { code: string } };

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
  /** Rows already on screen from an earlier read, so edits work before the next one lands. */
  initial?: IndustryProfileRow[] | null;
  list: () => Promise<ProfilesResult>;
  update: (body: { id: string; expectedRevision: number } & PendingEdit) => Promise<ProfilesResult>;
  publish: (state: ProfileSyncState) => void;
  notify: (message: string) => void;
  /** False after the account or active character owning this queue changes. */
  isCurrent?: () => boolean;
}): ProfileSync {
  const isCurrent = () => deps.isCurrent?.() ?? true;
  let rows: IndustryProfileRow[] | null = deps.initial ?? null;
  const pending = new Map<string, PendingEdit & { expectedRevision: number }>();
  let listFailed = false;
  let tail: Promise<void> = Promise.resolve();

  const emit = () =>
    isCurrent() && deps.publish({ profiles: rows === null ? null : overlayPending(rows, pending), listFailed });

  const enqueue = <T>(call: () => Promise<T>): Promise<T> => {
    const result = tail.then(call);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  const accept = (next: IndustryProfileRow[]) => {
    if (!isCurrent()) return;
    rows = next;
    for (const id of pending.keys()) {
      if (!next.some((row) => row.id === id)) pending.delete(id);
    }
    emit();
  };

  const read = async () => {
    if (!isCurrent()) return;
    // A read in flight is not a failure yet: the slot loads again until it settles.
    if (listFailed) {
      listFailed = false;
      emit();
    }
    const res = await deps.list();
    if (!isCurrent()) return;
    listFailed = !res.ok;
    if (res.ok) accept(res.data.profiles);
    else emit();
  };

  return {
    refresh: () => enqueue(read),
    request: (call) => enqueue(async () => {
      if (!isCurrent()) throw new Error('Profile session changed');
      const res = await call();
      if (!isCurrent()) throw new Error('Profile session changed');
      if (res.ok) accept(res.data.profiles);
      return res;
    }),
    save: (id, edit) => {
      if (!isCurrent()) return;
      const row = rows?.find((r) => r.id === id);
      if (row === undefined) return;
      pending.set(id, { ...edit, expectedRevision: pending.get(id)?.expectedRevision ?? row.revision });
      emit();
      void enqueue(async () => {
        if (!isCurrent()) return;
        const next = pending.get(id);
        if (next === undefined) return;
        const res = await deps.update({ id, ...next });
        if (!isCurrent()) return;
        if (!res.ok) {
          pending.delete(id);
          deps.notify(saveFailureMessage(res.error?.code));
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
