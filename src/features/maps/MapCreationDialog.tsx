'use client';

import {
  useId,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { toggleCharacterId } from '@/components/character-portrait-picker';
import { useAccountCharacters } from '@/components/use-account-characters';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogFocusTarget,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { displayTitle } from '@/components/ui/type-roles';
import { MAX_MAP_NAME_LENGTH } from '@/data/maps/api-contract';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import { AccessListEditor } from './AccessListEditor';
import { CharacterSearchControl } from './CharacterSearchControl';
import { OwnCharacterPicker } from './OwnCharacterPicker';
import {
  addAccessPrincipal,
  CREATOR_CHARACTER_REQUIRED_MESSAGE,
  initialCreationAccessDrafts,
  prepareMapCreation,
  removeAccessPrincipal,
  setAccessDraftRole,
  type AccessGrantDraft,
  type AccessPrincipalOption,
} from './access-editor-model';
import {
  createMapWithMinimumInterstitial,
  handoffCreatedMap,
  runMapCreationSubmit,
} from './map-creation-client';

type CreationPhase =
  | { readonly kind: 'editing' }
  | { readonly kind: 'creating' }
  | { readonly kind: 'error'; readonly message: string };

function Compass({ failed = false }: { failed?: boolean }) {
  return (
    <div
      className={
        failed
          ? 'size-14 text-tone-red'
          : 'size-14 text-isk motion-safe:animate-spin'
      }
    >
      <svg viewBox="0 0 48 48" aria-hidden className="size-full">
        <circle cx="24" cy="24" r="19" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M30 18 26 26 18 30l4-8 8-4Z" fill="currentColor" />
        <circle cx="24" cy="24" r="2" fill="currentColor" />
      </svg>
    </div>
  );
}

function CreationInterstitial({
  phase,
  titleId,
  onRetry,
}: {
  phase: Extract<CreationPhase, { kind: 'creating' | 'error' }>;
  titleId: string;
  onRetry: () => void;
}) {
  const failed = phase.kind === 'error';
  return (
    <div
      className="flex min-h-72 flex-col items-center justify-center gap-4 px-6 py-10 text-center"
      data-map-creation-interstitial={phase.kind}
    >
      <Compass failed={failed} />
      <div className="flex max-w-sm flex-col gap-1.5">
        <DialogTitle id={titleId} className={displayTitle()}>
          {failed ? 'Map creation paused' : 'Creating your map'}
        </DialogTitle>
        <DialogDescription className="font-ui text-ui leading-relaxed text-muted">
          {failed
            ? phase.message
            : 'Committing the map and confirming access before the first jump.'}
        </DialogDescription>
      </div>
      {failed ? (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      ) : (
        <span className="font-data text-label tracking-label uppercase text-faint">
          Neon → access projection → Atlas
        </span>
      )}
    </div>
  );
}

export interface MapCreationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly corporations: readonly CorporationAccessOption[];
  readonly openerRef?: DialogFocusTarget;
  readonly onCreated?: (mapId: string) => void;
}

const NOOP_CREATED = () => undefined;

function useMapCreationDialog({
  corporations,
  onCreated,
  onOpenChange,
}: Pick<MapCreationDialogProps, 'corporations' | 'onCreated' | 'onOpenChange'>) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [name, setName] = useState('');
  const [creatorCharacterIds, setCreatorCharacterIds] = useState<number[]>([]);
  const [grants, setGrants] = useState<AccessGrantDraft[]>(() =>
    initialCreationAccessDrafts(corporations),
  );
  const [phase, setPhase] = useState<CreationPhase>({ kind: 'editing' });
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    submittingRef.current = false;
    setName('');
    setCreatorCharacterIds([]);
    setGrants(initialCreationAccessDrafts(corporations));
    setPhase({ kind: 'editing' });
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next && phase.kind === 'creating') return;
    if (!next) resetForm();
    onOpenChange(next);
  }

  function clearFormError() {
    setFormError(null);
  }

  async function submit() {
    await runMapCreationSubmit(
      submittingRef.current,
      prepareMapCreation(name, creatorCharacterIds, grants, MAX_MAP_NAME_LENGTH),
      createMapWithMinimumInterstitial,
      {
        onInvalid: setFormError,
        onBegin: () => {
          submittingRef.current = true;
          setFormError(null);
          setPhase({ kind: 'creating' });
        },
        onFailed: (message) => {
          submittingRef.current = false;
          setPhase({ kind: 'error', message });
        },
        onCreated: (mapId) => {
          handoffCreatedMap(mapId, {
            reset: resetForm,
            close: () => onOpenChange(false),
            onCreated: onCreated ?? NOOP_CREATED,
            navigate: (href) => router.push(href),
          });
        },
      },
    );
  }

  return {
    canSubmit: prepareMapCreation(name, creatorCharacterIds, grants, MAX_MAP_NAME_LENGTH).ok,
    clearFormError,
    creatorCharacterIds,
    formError,
    grants,
    handleOpenChange,
    name,
    phase,
    setCreatorCharacterIds,
    setGrants,
    setName,
    submit,
  };
}

function CreationForm({
  canSubmit,
  clearFormError,
  corporations,
  creatorCharacterIds,
  formError,
  grants,
  name,
  nameInputRef,
  setCreatorCharacterIds,
  setGrants,
  setName,
  submit,
  titleId,
}: {
  readonly canSubmit: boolean;
  readonly clearFormError: () => void;
  readonly corporations: readonly CorporationAccessOption[];
  readonly creatorCharacterIds: readonly number[];
  readonly formError: string | null;
  readonly grants: readonly AccessGrantDraft[];
  readonly name: string;
  readonly nameInputRef: RefObject<HTMLInputElement | null>;
  readonly setCreatorCharacterIds: Dispatch<SetStateAction<number[]>>;
  readonly setGrants: Dispatch<SetStateAction<AccessGrantDraft[]>>;
  readonly setName: Dispatch<SetStateAction<string>>;
  readonly submit: () => Promise<void>;
  readonly titleId: string;
}) {
  const ownCharacters = useAccountCharacters();

  function addPrincipal(principal: AccessPrincipalOption) {
    setGrants((current) => addAccessPrincipal(current, principal));
    clearFormError();
  }

  return (
    <form
      className="flex flex-col"
      data-map-creation-dialog
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader
        titleId={titleId}
        title="Create map"
        closeLabel="Close map creation"
      />

      <DialogBody className="gap-5">
        <Field label="Map name">
          <Input
            ref={nameInputRef}
            value={name}
            maxLength={MAX_MAP_NAME_LENGTH}
            autoComplete="off"
            placeholder="Home chain"
            onChange={(event) => {
              setName(event.currentTarget.value);
              clearFormError();
            }}
          />
        </Field>
        <OwnCharacterPicker
          characters={ownCharacters}
          selectedIds={new Set(creatorCharacterIds)}
          onToggle={(change) => {
            setCreatorCharacterIds((current) => toggleCharacterId(current, change));
            clearFormError();
          }}
          hint={creatorCharacterIds.length === 0
            ? CREATOR_CHARACTER_REQUIRED_MESSAGE
            : 'Chosen characters can be tracked on this map. You stay the map admin.'}
        />
        <AccessListEditor
          mode="create"
          currentGrants={grants}
          corporations={corporations}
          onPrincipalAdd={addPrincipal}
          onRoleChange={(principal, role) => {
            setGrants((current) =>
              setAccessDraftRole('create', current, principal, role),
            );
            clearFormError();
          }}
          onPrincipalRemove={(principal) => {
            setGrants((current) => removeAccessPrincipal(current, principal));
            clearFormError();
          }}
          characterSearch={
            <CharacterSearchControl
              selectedPrincipals={grants}
              onSelect={addPrincipal}
            />
          }
        />
        {formError !== null ? <Banner tone="warn">{formError}</Banner> : null}
      </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button variant="secondary" size="sm" />}>
          Cancel
        </DialogClose>
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          Create map
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MapCreationDialog({
  open,
  onOpenChange,
  corporations,
  openerRef,
  onCreated,
}: MapCreationDialogProps) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const controller = useMapCreationDialog({
    corporations,
    onCreated,
    onOpenChange,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={controller.handleOpenChange}
      labelledBy={titleId}
      initialFocus={nameInputRef}
      finalFocus={openerRef}
      className="max-h-[calc(100dvh-2rem)] w-[min(46rem,calc(100vw-2rem))] overflow-y-auto"
    >
      {controller.phase.kind === 'creating' || controller.phase.kind === 'error' ? (
        <CreationInterstitial
          phase={controller.phase}
          titleId={titleId}
          onRetry={() => void controller.submit()}
        />
      ) : (
        <CreationForm
          canSubmit={controller.canSubmit}
          clearFormError={controller.clearFormError}
          corporations={corporations}
          creatorCharacterIds={controller.creatorCharacterIds}
          formError={controller.formError}
          grants={controller.grants}
          name={controller.name}
          nameInputRef={nameInputRef}
          setCreatorCharacterIds={controller.setCreatorCharacterIds}
          setGrants={controller.setGrants}
          setName={controller.setName}
          submit={controller.submit}
          titleId={titleId}
        />
      )}
    </Dialog>
  );
}
