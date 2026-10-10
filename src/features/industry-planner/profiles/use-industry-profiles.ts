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
import { createProfileSync, type ProfileSync, type ProfileSyncState, type ProfilesResult } from './profile-sync';
import { createFailureMessage, type PendingEdit } from './profile-view';
import { currentReadIdentity, type ReadIdentity, useReadIdentity } from '@/platform/auth/read-identity';

export interface IndustryProfilesState extends ProfileSyncState {
  busy: boolean;
  refresh: () => void;
  create: (name: string, document: ProfileDocument) => Promise<string | null>;
  duplicate: (id: string, name: string) => Promise<string | null>;
  save: (id: string, edit: PendingEdit) => void;
  remove: (id: string) => Promise<boolean>;
}

type AddOutcome =
  | { ok: true; data: { profiles: IndustryProfileRow[]; id: string } }
  | { ok: false; error?: { code: string } };

async function listProfiles(): Promise<ProfilesResult> {
  const res = await readWithRetries(async () => {
    const attempt = await apiFetch(industryProfilesEndpoint, { cache: 'no-store' });
    return attempt.ok ? attempt : null;
  });
  return res ?? { ok: false };
}

function updateProfile(
  body: { id: string; expectedRevision: number } & PendingEdit,
): Promise<ProfilesResult> {
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
      isCurrent: () => identity !== null && identity === currentReadIdentity(),
    }),
    [identity],
  );

  useEffect(() => {
    if (enabled && identity !== null) void sync.refresh();
  }, [enabled, identity, sync]);

  const addProfile = useCallback(
    async (call: () => Promise<AddOutcome>): Promise<string | null> => {
      if (identity === null || identity !== currentReadIdentity()) return null;
      setBusyIdentity(identity);
      const res = await sync.request(call).catch(() => null);
      if (identity !== currentReadIdentity()) return null;
      setBusyIdentity(null);
      if (!res?.ok) {
        toast.error(createFailureMessage(res?.error?.code));
        return null;
      }
      return res.data.id;
    },
    [sync, identity],
  );

  const create = useCallback(
    (name: string, document: ProfileDocument) =>
      addProfile(() => apiFetch(createIndustryProfileEndpoint, { body: { name, document } })),
    [addProfile],
  );

  const duplicate = useCallback(
    (id: string, name: string) =>
      addProfile(() => apiFetch(duplicateIndustryProfileEndpoint, { body: { id, name } })),
    [addProfile],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (identity === null || identity !== currentReadIdentity()) return false;
      setBusyIdentity(identity);
      const res = await sync.request(() => apiFetch(deleteIndustryProfileEndpoint, { body: { id } })).catch(() => null);
      if (identity !== currentReadIdentity()) return false;
      setBusyIdentity(null);
      if (!res?.ok) {
        toast.error("Couldn't delete the profile.");
        return false;
      }
      return true;
    },
    [sync, identity],
  );

  const refresh = useCallback(() => void sync.refresh(), [sync]);

  return { ...state, profiles: state.profiles ?? remembered, busy, refresh, create, duplicate, save: sync.save, remove };
}
