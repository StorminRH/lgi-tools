'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  type DialogFocusTarget,
} from '@/components/ui/dialog';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
  MapRole,
} from '@/data/maps/access-contract';
import { AccessListEditor } from './AccessListEditor';
import { CharacterSearchControl } from './CharacterSearchControl';
import {
  accessPrincipalKey,
  addAccessPrincipal,
  removeAccessPrincipal,
  setAccessDraftRole,
  type AccessGrantDraft,
  type AccessPrincipalOption,
} from './access-editor-model';
import { mapAccessFailureMessage, updateMapAccess } from './map-access-client';
import { deleteMap, mapLifecycleFailureMessage } from './map-lifecycle-client';

/** Props for the controlled shared map-access management door. */
export interface MapAccessDialogProps {
  readonly mapId: string;
  readonly mapName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly finalFocus: DialogFocusTarget;
  readonly corporations: readonly CorporationAccessOption[];
  readonly initialGrants: readonly MapAccessGrantOption[];
}

function initialDrafts(grants: readonly MapAccessGrantOption[]): AccessGrantDraft[] {
  return grants.map((grant) => ({ ...grant }));
}

/** Stable identity for one authoritative server grant snapshot. */
export function mapAccessGrantRevision(
  grants: readonly MapAccessGrantOption[],
): string {
  return JSON.stringify(
    grants
      .map((grant) => [grant.ownerType, grant.ownerId, grant.role, grant.name] as const)
      .toSorted((left, right) =>
        `${left[0]}:${left[1]}`.localeCompare(`${right[0]}:${right[1]}`),
      ),
  );
}

/**
 * Replaces persisted drafts with a refreshed authoritative snapshot while
 * retaining only principals whose unsaved role is still deliberately blank.
 */
export function reconcileAccessGrantDrafts(
  serverGrants: readonly MapAccessGrantOption[],
  currentDrafts: readonly AccessGrantDraft[],
): AccessGrantDraft[] {
  const serverKeys = new Set(serverGrants.map(accessPrincipalKey));
  const pendingDrafts = currentDrafts.filter(
    (draft) => draft.role === null && !serverKeys.has(accessPrincipalKey(draft)),
  );
  return [...initialDrafts(serverGrants), ...pendingDrafts];
}

function useAccessGrantEditor(
  mapId: string,
  initialGrants: readonly MapAccessGrantOption[],
) {
  const router = useRouter();
  const [grants, setGrants] = useState<AccessGrantDraft[]>(() =>
    initialDrafts(initialGrants),
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serverRevision = mapAccessGrantRevision(initialGrants);
  const appliedServerRevision = useRef(serverRevision);

  useEffect(() => {
    if (appliedServerRevision.current === serverRevision) return;
    appliedServerRevision.current = serverRevision;
    setGrants((current) => reconcileAccessGrantDrafts(initialGrants, current));
  }, [initialGrants, serverRevision]);

  async function commitRole(principal: AccessPrincipalOption, role: MapRole) {
    const key = accessPrincipalKey(principal);
    setBusyKey(key);
    setError(null);
    const outcome = await updateMapAccess({
      operation: 'upsert',
      mapId,
      grant: { ownerType: principal.ownerType, ownerId: principal.ownerId, role },
    });
    setBusyKey(null);
    if (!outcome.ok) return setError(mapAccessFailureMessage(outcome));
    setGrants((current) => setAccessDraftRole('manage', current, principal, role));
    router.refresh();
  }

  async function revoke(principal: AccessPrincipalOption) {
    const key = accessPrincipalKey(principal);
    setBusyKey(key);
    setError(null);
    const outcome = await updateMapAccess({
      operation: 'revoke',
      mapId,
      principal: { ownerType: principal.ownerType, ownerId: principal.ownerId },
    });
    setBusyKey(null);
    if (!outcome.ok) return setError(mapAccessFailureMessage(outcome));
    setGrants((current) => removeAccessPrincipal(current, principal));
    router.refresh();
  }

  function addPrincipal(principal: AccessPrincipalOption) {
    setGrants((current) => addAccessPrincipal(current, principal));
    setError(null);
  }

  return { grants, busyKey, error, commitRole, revoke, addPrincipal };
}

function useMapDeletion(mapId: string, onDeleted: () => void) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeMap() {
    setDeleting(true);
    setError(null);
    const outcome = await deleteMap({ mapId });
    setDeleting(false);
    if (!outcome.ok) return setError(mapLifecycleFailureMessage('delete'));
    onDeleted();
    const next = new URLSearchParams(searchParams.toString());
    if (next.get('map') !== mapId) return router.refresh();
    next.delete('map');
    const query = next.toString();
    router.push(query === '' ? '/atlas' : `/atlas?${query}`);
  }

  return { deleting, error, removeMap };
}

/**
 * Manages one map's delegated grants through the existing transport-free
 * editor and the sole Neon-then-projection mutation route.
 */
export function MapAccessDialog({
  mapId,
  mapName,
  open,
  onOpenChange,
  finalFocus,
  corporations,
  initialGrants,
}: MapAccessDialogProps) {
  const titleId = useId();
  const access = useAccessGrantEditor(mapId, initialGrants);
  const deletion = useMapDeletion(mapId, () => onOpenChange(false));
  const disabled = access.busyKey !== null || deletion.deleting;
  const error = access.error ?? deletion.error;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!disabled) onOpenChange(next);
      }}
      labelledBy={titleId}
      finalFocus={finalFocus}
      className="max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex flex-col gap-1">
          <DialogTitle
            id={titleId}
            className="font-display text-h2 font-semibold tracking-copy uppercase text-name"
          >
            Manage {mapName}
          </DialogTitle>
          <DialogDescription className="font-ui text-ui text-muted">
            Grant, change, or revoke delegated access. The map creator is not a grant row.
          </DialogDescription>
        </div>
        <DialogClose
          render={<Button variant="ghost" size="sm" />}
          aria-label="Close map access"
          disabled={disabled}
        >
          ×
        </DialogClose>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        <AccessListEditor
          mode="manage"
          currentGrants={access.grants}
          corporations={corporations}
          disabled={disabled}
          onPrincipalAdd={access.addPrincipal}
          onRoleChange={(principal, role) => void access.commitRole(principal, role)}
          onPrincipalRemove={(principal) => void access.revoke(principal)}
          characterSearch={
            <CharacterSearchControl
              disabled={access.busyKey !== null}
              selectedPrincipals={access.grants}
              onSelect={access.addPrincipal}
            />
          }
        />
        {error !== null ? <Banner tone="warn">{error}</Banner> : null}
      </div>

      <footer className="flex items-center justify-between border-t border-border-soft px-4 py-3">
        <Button
          variant="danger"
          size="sm"
          disabled={disabled}
          onClick={() => void deletion.removeMap()}
        >
          {deletion.deleting ? 'Deleting…' : 'Delete map'}
        </Button>
        <DialogClose
          render={<Button variant="secondary" size="sm" />}
          disabled={disabled}
        >
          Done
        </DialogClose>
      </footer>
    </Dialog>
  );
}
