'use client';

import { useCallback, useEffect, useState } from 'react';
import { createRememberedRead, useRememberedRead } from '@/components/remembered-read';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/transport/api-client';
import {
  createIndustryProfileEndpoint,
  deleteIndustryProfileEndpoint,
  duplicateIndustryProfileEndpoint,
  type IndustryProfileRow,
  industryProfilesEndpoint,
  updateIndustryProfileEndpoint,
} from './api-contract';
import { readWithRetries } from '../read-with-retries';
import type { ProfileDocument } from './profile-document';
import { createProfileSync, type ProfileSync, type ProfileSyncState, type ProfilesResult } from './profile-sync';
import { createFailureMessage, type PendingEdit } from './profile-view';

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

async function updateProfile(
  body: { id: string; expectedRevision: number } & PendingEdit,
): Promise<ProfilesResult> {
  const res = await apiFetch(updateIndustryProfileEndpoint, { body }).catch(() => null);
  return res ?? { ok: false };
}

// The last list outlives the pages that show it: Profiles and the planner
// draw it at once on a return and refresh it quietly.
const profilesMemory = createRememberedRead<IndustryProfileRow[]>();

/** The signed-in account's production profiles, with create, edit and delete. */
export function useIndustryProfiles(enabled: boolean): IndustryProfilesState {
  const remembered = useRememberedRead(profilesMemory);
  const [state, setState] = useState<ProfileSyncState>({ profiles: null, listFailed: false });
  const [busy, setBusy] = useState(false);
  const [sync] = useState<ProfileSync>(() =>
    createProfileSync({
      initial: profilesMemory.get(),
      list: listProfiles,
      update: updateProfile,
      publish: (next) => {
        setState(next);
        if (next.profiles !== null) profilesMemory.set(next.profiles);
      },
      notify: (message) => toast.error(message),
    }),
  );

  useEffect(() => {
    if (enabled) void sync.refresh();
  }, [enabled, sync]);

  const addProfile = useCallback(
    async (call: () => Promise<AddOutcome>): Promise<string | null> => {
      setBusy(true);
      const res = await sync.request(call).catch(() => null);
      setBusy(false);
      if (!res?.ok) {
        toast.error(createFailureMessage(res?.error?.code));
        return null;
      }
      return res.data.id;
    },
    [sync],
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
      setBusy(true);
      const res = await sync.request(() => apiFetch(deleteIndustryProfileEndpoint, { body: { id } })).catch(() => null);
      setBusy(false);
      if (!res?.ok) {
        toast.error("Couldn't delete the profile.");
        return false;
      }
      return true;
    },
    [sync],
  );

  const refresh = useCallback(() => void sync.refresh(), [sync]);

  return { ...state, profiles: state.profiles ?? remembered, busy, refresh, create, duplicate, save: sync.save, remove };
}
