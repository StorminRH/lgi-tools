'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { EveImage } from '@/components/eve-image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RadioGroup, type RadioOption } from '@/components/ui/radio-group';
import type { CorporationAccessOption, MapRole } from '@/data/maps/access-contract';
import { characterPortraitUrl, corporationLogoUrl } from '@/lib/eve-image';
import {
  accessPrincipalKey,
  accessRolesForMode,
  corporationAccessPrincipal,
  mapRoleLabel,
  type AccessEditorMode,
  type AccessGrantDraft,
  type AccessPrincipalOption,
} from './access-editor-model';

function roleOptions(mode: AccessEditorMode): RadioOption[] {
  return accessRolesForMode(mode).map((role) => ({
    value: role,
    label: mapRoleLabel(role),
  }));
}

function PrincipalImage({ principal }: { principal: AccessPrincipalOption }) {
  if (principal.ownerType === 'character') {
    return (
      <CharacterPortrait
        characterId={principal.ownerId}
        name={principal.name}
        size={32}
        src={principal.imageUrl ?? characterPortraitUrl(principal.ownerId, 64)}
      />
    );
  }
  return (
    <EveImage
      source="eve"
      family="corporation-logo"
      src={principal.imageUrl ?? corporationLogoUrl(principal.ownerId, 64)}
      alt={principal.name}
      width={32}
      height={32}
      className="size-8 rounded-ctl border border-border-idle object-cover"
    />
  );
}

export interface AccessListEditorProps {
  readonly mode: AccessEditorMode;
  readonly currentGrants: readonly AccessGrantDraft[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly onPrincipalAdd: (principal: AccessPrincipalOption) => void;
  readonly onRoleChange: (principal: AccessGrantDraft, role: MapRole) => void;
  readonly onPrincipalRemove: (principal: AccessGrantDraft) => void;
  readonly characterSearch?: ReactNode;
  readonly disabled?: boolean;
}

export function AccessListEditor({
  mode,
  currentGrants,
  corporations,
  onPrincipalAdd,
  onRoleChange,
  onPrincipalRemove,
  characterSearch,
  disabled = false,
}: AccessListEditorProps) {
  const [revokeTarget, setRevokeTarget] = useState<AccessGrantDraft | null>(null);
  const selectedKeys = useMemo(
    () => new Set(currentGrants.map(accessPrincipalKey)),
    [currentGrants],
  );
  const options = roleOptions(mode);

  function requestRemove(grant: AccessGrantDraft) {
    if (mode === 'manage') {
      setRevokeTarget(grant);
      return;
    }
    onPrincipalRemove(grant);
  }

  return (
    <div className="flex flex-col gap-4" data-map-access-editor={mode}>
      <section className="flex flex-col gap-2" aria-labelledby="map-access-corporations">
        <div>
          <h3
            id="map-access-corporations"
            className="font-display text-nav font-semibold tracking-copy uppercase text-name"
          >
            Corporations
          </h3>

          <p className="font-ui text-label text-faint">
            Select from your current corporations, then choose access explicitly.
          </p>

        </div>

        {corporations.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {corporations.map((corporation) => {
              const principal = corporationAccessPrincipal(corporation);
              const key = accessPrincipalKey(principal);
              const selected = selectedKeys.has(key);
              const selectedGrant = currentGrants.find(
                (grant) => accessPrincipalKey(grant) === key,
              );
              return (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-ctl border border-border-soft bg-bg-deep px-2.5 py-2"
                >
                  <Checkbox
                    checked={selected}
                    disabled={disabled}
                    label={`${selected ? 'Remove' : 'Add'} ${corporation.name}`}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onPrincipalAdd(principal);
                      } else if (selectedGrant !== undefined) {
                        requestRemove(selectedGrant);
                      }
                    }}
                  />
                  <PrincipalImage principal={principal} />
                  <span className="min-w-0 truncate font-ui text-ui text-text">
                    {corporation.name}
                  </span>

                </div>

              );
            })}
          </div>

        ) : (
          <p className="font-ui text-ui text-muted">No linked corporations available.</p>

        )}
      </section>

      {characterSearch}

      <section className="flex flex-col gap-2" aria-labelledby="map-access-selected">
        <h3
          id="map-access-selected"
          className="font-display text-nav font-semibold tracking-copy uppercase text-name"
        >
          Access list
        </h3>

        {currentGrants.length === 0 ? (
          <p className="font-ui text-ui text-muted">Private — no delegated access.</p>

        ) : (
          <div className="flex flex-col gap-2">
            {currentGrants.map((grant) => (
              <div
                key={accessPrincipalKey(grant)}
                className="grid gap-3 rounded-ctl border border-border-soft bg-surface-sunk px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                data-map-access-principal={accessPrincipalKey(grant)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PrincipalImage principal={grant} />
                  <div className="min-w-0">
                    <p className="truncate font-ui text-ui text-text">{grant.name}</p>

                    <p className="font-ui text-label capitalize text-faint">
                      {grant.ownerType}
                    </p>

                  </div>

                </div>

                <RadioGroup
                  label={`Access for ${grant.name}`}
                  options={options}
                  value={grant.role}
                  disabled={disabled}
                  onValueChange={(role) => onRoleChange(grant, role as MapRole)}
                  className="md:min-w-28"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => requestRemove(grant)}
                >
                  {mode === 'manage' ? 'Revoke' : 'Remove'}
                </Button>

              </div>

            ))}
          </div>

        )}
      </section>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revoke map access?"
        consequence={
          revokeTarget === null
            ? ''
            : `${revokeTarget.name} will lose this delegated map role after the access projection updates.`
        }
        busy={false}
        confirmLabel="Revoke access"
        onConfirm={() => {
          if (revokeTarget === null) return;
          onPrincipalRemove(revokeTarget);
          setRevokeTarget(null);
        }}
      />
    </div>

  );
}
