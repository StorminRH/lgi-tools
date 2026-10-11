'use client';

import { useId } from 'react';
import type { PortraitToggleChange } from '@/components/character-portrait-picker';
import { useAccountCharacters } from '@/components/use-account-characters';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  DialogHeader,
  type DialogFocusTarget,
} from '@/components/ui/dialog';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
  MapBlockOption,
  MapRole,
} from '@/data/maps/access-contract';
import { AccessListEditor } from './AccessListEditor';
import { MapBlockList, useMapBlockEditor } from './MapBlockList';
import { OwnCharacterPicker } from './OwnCharacterPicker';
import {
  accessPrincipalKey,
  addAccessPrincipal,
  grantedCharacterIds,
  removeAccessPrincipal,
  setAccessDraftRole,
  type AccessGrantDraft,
  type AccessPrincipalOption,
} from './access-editor-model';
import { useMapAccessWrite, useServerDraft } from './use-map-access-editor';

export interface MapAccessDialogProps {
  readonly mapId: string;
  readonly mapName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly finalFocus: DialogFocusTarget;
  readonly corporations: readonly CorporationAccessOption[];
  readonly initialGrants: readonly MapAccessGrantOption[];
  readonly initialBlocks: readonly MapBlockOption[];
}

const OWN_CHARACTER_ROLE: MapRole = 'viewer';

function initialDrafts(grants: readonly MapAccessGrantOption[]): AccessGrantDraft[] {
  return grants.map((grant) => ({ ...grant }));
}

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
  const [grants, setGrants] = useServerDraft(
    initialGrants,
    mapAccessGrantRevision(initialGrants),
    (server, current: AccessGrantDraft[] | null) =>
      reconcileAccessGrantDrafts(server, current ?? []),
  );
  const write = useMapAccessWrite<string>();

  function commitRole(principal: AccessPrincipalOption, role: MapRole) {
    return write.run(
      accessPrincipalKey(principal),
      {
        operation: 'upsert',
        mapId,
        grant: { ownerType: principal.ownerType, ownerId: principal.ownerId, role },
      },
      // Adding first lists an own character that is not on the list yet.
      () => setGrants((current) =>
        setAccessDraftRole('manage', addAccessPrincipal(current, principal), principal, role)),
    );
  }

  function revoke(principal: AccessPrincipalOption) {
    return write.run(
      accessPrincipalKey(principal),
      {
        operation: 'revoke',
        mapId,
        principal: { ownerType: principal.ownerType, ownerId: principal.ownerId },
      },
      () => setGrants((current) => removeAccessPrincipal(current, principal)),
    );
  }

  function addPrincipal(principal: AccessPrincipalOption) {
    setGrants((current) => addAccessPrincipal(current, principal));
    write.clearError();
  }

  return {
    grants,
    busyKey: write.busy,
    error: write.error,
    commitRole,
    revoke,
    addPrincipal,
  };
}

export function MapAccessDialog({
  mapId,
  mapName,
  open,
  onOpenChange,
  finalFocus,
  corporations,
  initialGrants,
  initialBlocks,
}: MapAccessDialogProps) {
  const titleId = useId();
  const access = useAccessGrantEditor(mapId, initialGrants);
  const blocks = useMapBlockEditor(mapId, initialBlocks);
  const ownCharacters = useAccountCharacters();
  const disabled = access.busyKey !== null || blocks.busy;
  const error = access.error;

  function toggleOwnCharacter({ characterId, selected }: PortraitToggleChange) {
    const character = ownCharacters?.find((own) => own.characterId === characterId);
    if (character === undefined) return;
    const principal = { ownerType: 'character' as const, ownerId: characterId, name: character.name };
    void (selected ? access.commitRole(principal, OWN_CHARACTER_ROLE) : access.revoke(principal));
  }

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
      <DialogHeader
        titleId={titleId}
        title={`Manage ${mapName}`}
        description="Grant, change, or revoke access. Only characters on this list can be tracked here."
        closeLabel="Close map access"
        closeDisabled={disabled}
      />

      <DialogBody className="gap-4">
        <OwnCharacterPicker
          characters={ownCharacters}
          selectedIds={grantedCharacterIds(access.grants)}
          onToggle={toggleOwnCharacter}
          disabled={disabled}
          hint="Your chosen characters can be tracked on this map."
        />
        <AccessListEditor
          mode="manage"
          currentGrants={access.grants}
          corporations={corporations}
          disabled={disabled}
          onPrincipalAdd={access.addPrincipal}
          onRoleChange={(principal, role) => void access.commitRole(principal, role)}
          onPrincipalRemove={(principal) => void access.revoke(principal)}
        />
        {error !== null ? <Banner tone="warn">{error}</Banner> : null}
        <MapBlockList editor={blocks} disabled={disabled} />
      </DialogBody>

      <DialogFooter>
        <DialogClose
          render={<Button variant="secondary" size="sm" />}
          disabled={disabled}
        >
          Done
        </DialogClose>
      </DialogFooter>
    </Dialog>
  );
}
