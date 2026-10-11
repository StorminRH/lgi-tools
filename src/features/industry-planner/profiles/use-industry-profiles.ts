'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRememberedRead, useRememberedRead } from '@/components/remembered-read';
import { toast } from '@/components/ui/toast';
import { readWithRetries } from '@/lib/retry';
import { apiFetch } from '@/transport/api-client';
import {
  createIndustryProfileEndpoint,
  deleteIndustryProfileEndpoint,
  duplicateIndustryProfileEndpoint,
  type IndustryProfileRow,
  industryProfilesEndpoint,
  updateIndustryProfileEndpoint,
} from './api-contract';
import type { ProfileDocument } from './profile-document';
import {
  createProfileSync,
  type ProfileSync,
  type ProfileSyncState,
  type ProfilesResult,
  type ProfileUpdateResult,
} from './profile-sync';
import {
  createFailureMessage,
  deleteFailureMessage,
  duplicateFailureMessage,
  type PendingEdit,
} from './profile-view';
import { isCurrentReadIdentity, type ReadIdentity, useReadIdentity } from '@/platform/auth/read-identity';

export interface IndustryProfilesState extends ProfileSyncState {
  busy: boolean;
  refresh: () => void;
  create: (name: string, document: ProfileDocument) => Promise<string | null>;
  duplicate: (id: string, name: string) => Promise<string | null>;
  save: (id: string, edit: PendingEdit) => void;
  remove: (id: string) => Promise<boolean>;
}

/** A create or duplicate that answered with the rows and the new profile's id. */
type AddedProfile = { ok: true; data: { profiles: IndustryProfileRow[]; id: string } };

async function listProfiles(): Promise<ProfilesResult> {
  const res = await readWithRetries(async () => {
    const attempt = await apiFetch(industryProfilesEndpoint, { cache: 'no-store' });
    return attempt.ok ? attempt : null;
  });
  return res ?? { ok: false };
}

function updateProfile(
  body: { id: string; expectedRevision: number } & PendingEdit,
): Promise<ProfileUpdateResult> {
  return apiFetch(updateIndustryProfileEndpoint, { body });
}

// The last list outlives the pages that show it: Profiles and the planner
// draw it at once on a return and refresh it quietly.
const profilesMemory = createRememberedRead<IndustryProfileRow[]>();

/** The signed-in account's production profiles, with create, edit and delete. */
export function useIndustryProfiles(enabled: boolean): IndustryProfilesState {
  const remembered = useRememberedRead(profilesMemory);
  const identity = useReadIdentity();
  const [published, setPublished] = useState<{ identity: ReadIdentity | null; state: ProfileSyncState }>({
    identity,
    state: { profiles: null, listFailed: false },
  });
  const state = published.identity === identity ? published.state : { profiles: null, listFailed: false };
  const [busyIdentity, setBusyIdentity] = useState<ReadIdentity | null>(null);
  const busy = identity !== null && busyIdentity === identity;
  const sync = useMemo<ProfileSync>(() =>
    createProfileSync({
      initial: identity === null ? null : profilesMemory.get(),
      list: listProfiles,
      update: updateProfile,
      publish: (next) => {
        setPublished({ identity, state: next });
        if (next.profiles !== null) profilesMemory.set(next.profiles, identity);
      },
      notify: (message) => toast.error(message),
      isCurrent: () => isCurrentReadIdentity(identity),
    }),
    [identity],
  );

  useEffect(() => {
    if (enabled && identity !== null) void sync.refresh();
  }, [enabled, identity, sync]);

  // sync.request rejects a call that a session change dropped. It reads as null,
  // and the identity check after it ends that call before any notice.
  const addProfile = useCallback(
    async <TFailure extends { ok: false }>(
      call: () => Promise<AddedProfile | TFailure>,
      describe: (failure: TFailure | null) => string,
    ): Promise<string | null> => {
      if (!isCurrentReadIdentity(identity)) return null;
      setBusyIdentity(identity);
      const res = await sync.request(call).catch(() => null);
      if (!isCurrentReadIdentity(identity)) return null;
      setBusyIdentity(null);
      if (res === null || !res.ok) {
        toast.error(describe(res));
        return null;
      }
      return res.data.id;
    },
    [sync, identity],
  );

  const create = useCallback(
    (name: string, document: ProfileDocument) =>
      addProfile(() => apiFetch(createIndustryProfileEndpoint, { body: { name, document } }), createFailureMessage),
    [addProfile],
  );

  const duplicate = useCallback(
    (id: string, name: string) =>
      addProfile(() => apiFetch(duplicateIndustryProfileEndpoint, { body: { id, name } }), duplicateFailureMessage),
    [addProfile],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isCurrentReadIdentity(identity)) return false;
      setBusyIdentity(identity);
      const res = await sync.request(() => apiFetch(deleteIndustryProfileEndpoint, { body: { id } })).catch(() => null);
      if (!isCurrentReadIdentity(identity)) return false;
      setBusyIdentity(null);
      if (res === null || !res.ok) {
        toast.error(deleteFailureMessage(res));
        return false;
      }
      return true;
    },
    [sync, identity],
  );

  const refresh = useCallback(() => void sync.refresh(), [sync]);

  return { ...state, profiles: state.profiles ?? remembered, busy, refresh, create, duplicate, save: sync.save, remove };
}
