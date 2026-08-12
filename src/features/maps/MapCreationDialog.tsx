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
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MAX_MAP_NAME_LENGTH } from '@/data/maps/api-contract';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import { AccessListEditor } from './AccessListEditor';
import { CharacterSearchControl } from './CharacterSearchControl';
import {
  addAccessPrincipal,
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
  mapCreationFailureMessage,
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
  onRetry,
}: {
  phase: Extract<CreationPhase, { kind: 'creating' | 'error' }>;
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
        <h2 className="font-display text-h2 font-semibold tracking-copy uppercase text-name">
          {failed ? 'Map creation paused' : 'Creating your map'}
        </h2>
        <p className="font-ui text-ui leading-relaxed text-muted">
          {failed
            ? phase.message
            : 'Committing the map and confirming access before the first jump.'}
        </p>
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

/** Props for the controlled Atlas map-creation dialog. */
export interface MapCreationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly corporations: readonly CorporationAccessOption[];
  readonly openerRef?: RefObject<HTMLElement | null>;
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
  const [grants, setGrants] = useState<AccessGrantDraft[]>(() =>
    initialCreationAccessDrafts(corporations),
  );
  const [phase, setPhase] = useState<CreationPhase>({ kind: 'editing' });
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    submittingRef.current = false;
    setName('');
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
    if (submittingRef.current) return;
    const prepared = prepareMapCreation(name, grants, MAX_MAP_NAME_LENGTH);
    if (!prepared.ok) {
      setFormError(prepared.message);
      return;
    }

    submittingRef.current = true;
    setFormError(null);
    setPhase({ kind: 'creating' });
    const outcome = await createMapWithMinimumInterstitial(prepared.input);
    if (!outcome.ok) {
      submittingRef.current = false;
      setPhase({ kind: 'error', message: mapCreationFailureMessage(outcome) });
      return;
    }

    handoffCreatedMap(outcome.data.mapId, {
      reset: resetForm,
      close: () => onOpenChange(false),
      onCreated: onCreated ?? NOOP_CREATED,
      navigate: (href) => router.push(href),
    });
  }

  return {
    canSubmit: prepareMapCreation(name, grants, MAX_MAP_NAME_LENGTH).ok,
    clearFormError,
    formError,
    grants,
    handleOpenChange,
    name,
    phase,
    setGrants,
    setName,
    submit,
  };
}

function CreationForm({
  canSubmit,
  clearFormError,
  corporations,
  formError,
  grants,
  name,
  nameInputRef,
  setGrants,
  setName,
  submit,
  titleId,
}: {
  readonly canSubmit: boolean;
  readonly clearFormError: () => void;
  readonly corporations: readonly CorporationAccessOption[];
  readonly formError: string | null;
  readonly grants: readonly AccessGrantDraft[];
  readonly name: string;
  readonly nameInputRef: RefObject<HTMLInputElement | null>;
  readonly setGrants: Dispatch<SetStateAction<AccessGrantDraft[]>>;
  readonly setName: Dispatch<SetStateAction<string>>;
  readonly submit: () => Promise<void>;
  readonly titleId: string;
}) {
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
      <header className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
        <div className="flex flex-col gap-1">
          <DialogTitle
            id={titleId}
            className="font-display text-h2 font-semibold tracking-copy uppercase text-name"
          >
            Create map
          </DialogTitle>
          <DialogDescription className="font-ui text-ui text-muted">
            Name the chain and explicitly assign any delegated access.
          </DialogDescription>
        </div>
        <DialogClose
          render={<Button variant="ghost" size="sm" />}
          aria-label="Close map creation"
        >
          ×
        </DialogClose>
      </header>

      <div className="flex flex-col gap-5 px-4 py-4">
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
      </div>

      <footer className="flex items-center justify-end gap-2.5 border-t border-border-soft px-4 py-3">
        <DialogClose render={<Button variant="secondary" size="sm" />}>
          Cancel
        </DialogClose>
        <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
          Create map
        </Button>
      </footer>
    </form>
  );
}

/**
 * Creates one map through the existing atomic route, keeps the compass visible
 * for at least five seconds, and hands the successful map to the keyed Atlas
 * host through a push navigation.
 */
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
          onRetry={() => void controller.submit()}
        />
      ) : (
        <CreationForm
          canSubmit={controller.canSubmit}
          clearFormError={controller.clearFormError}
          corporations={corporations}
          formError={controller.formError}
          grants={controller.grants}
          name={controller.name}
          nameInputRef={nameInputRef}
          setGrants={controller.setGrants}
          setName={controller.setName}
          submit={controller.submit}
          titleId={titleId}
        />
      )}
    </Dialog>
  );
}
