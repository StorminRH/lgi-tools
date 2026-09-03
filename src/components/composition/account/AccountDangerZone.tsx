'use client';

import { type RefObject, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverHeading, PopoverRow } from '@/components/ui/popover';
import { SectionHeader } from '@/components/ui/section-header';
import { toast } from '@/components/ui/toast';
import { apiFetch } from '@/transport/api-client';
import {
  isDeleteAcknowledged,
  redirectTargetFor,
  runDeleteAccount,
  runLogoutEverywhere,
  runPurgeCharacter,
} from '@/platform/auth/account-actions';
import { authClient } from '@/platform/auth/auth-client';
import { confirmGateReducer, INITIAL_CONFIRM_PHASE } from '@/platform/auth/confirm-gate';
import { RevokeRedirectLightbox } from './RevokeRedirectLightbox';

export function AccountDangerZone({
  characters,
}: {
  characters: { characterId: number; name: string }[];
}) {
  const [emptied, setEmptied] = useState(false);
  const onEmptied = () => setEmptied(true);

  return (
    <Card>
      <SectionHeader
        size="md"
        label={<span className="text-ui text-tone-red">Danger zone</span>}

        hint={
          <Popover
            label="What purge and unlink do"
            trigger="?"
            triggerClassName="grid h-4 w-4 place-items-center rounded-full border border-border text-micro text-muted hover:text-text"
          >
            <PopoverHeading>Purge vs unlink</PopoverHeading>

            <PopoverRow label="Purge">
              clears what the site has stored for a character and stops LGI.tools from accessing its
              EVE data.
            </PopoverRow>

            <PopoverRow label="Unlink">
              just detaches the character (on the roster above) — you can link it again later.
            </PopoverRow>

          </Popover>

        }
      />
      <div className="flex flex-col gap-4 px-3.5 py-3.5">
        <div className="flex flex-col gap-2.5">
          <p className="text-ui leading-relaxed text-muted">
            Purging a character clears what the site has stored for it and stops LGI.tools from
            accessing that character’s EVE data.
          </p>

          {characters.length === 0 ? (
            <EmptyState>No characters to purge.</EmptyState>

          ) : (
            <ul className="flex flex-col gap-2">
              {characters.map((c) => (
                <li key={c.characterId}>
                  <PurgeCharacterControl
                    characterId={c.characterId}
                    characterName={c.name}
                    isOnlyCharacter={characters.length === 1}
                    onEmptied={onEmptied}
                  />
                </li>

              ))}
            </ul>

          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border-soft pt-3.5">
          <LogoutEverywhereControl />
          <DeleteAccountControl onEmptied={onEmptied} />
        </div>

      </div>

      <RevokeRedirectLightbox open={emptied} />
    </Card>

  );
}

function useConfirmGate() {
  const [phase, dispatch] = useReducer(confirmGateReducer, INITIAL_CONFIRM_PHASE);
  const [errored, setErrored] = useState(false);

  function request() {
    setErrored(false);
    dispatch({ type: 'request' });
  }

  async function run<T extends { kind: string }>(
    action: () => Promise<T>,
    errorToast: string,
  ): Promise<T> {
    setErrored(false);
    dispatch({ type: 'confirm' });
    const outcome = await action();
    if (outcome.kind === 'error') {
      dispatch({ type: 'fail' });
      setErrored(true);
      toast.error(errorToast);
    }
    return outcome;
  }

  return {
    errored,
    open: phase !== 'idle',
    busy: phase === 'running',
    request,
    cancel: () => dispatch({ type: 'cancel' }),
    reset: () => dispatch({ type: 'reset' }),
    run,
  };
}

function DangerButton({
  triggerRef,
  onClick,
  label,
  className = '',
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      ref={triggerRef}
      variant="danger"
      size="sm"
      onClick={onClick}
      className={`shrink-0 ${className}`}
    >
      {label}
    </Button>

  );
}

function PurgeCharacterControl({
  characterId,
  characterName,
  isOnlyCharacter,
  onEmptied,
}: {
  characterId: number;
  characterName: string;
  isOnlyCharacter: boolean;
  onEmptied: () => void;
}) {
  const router = useRouter();
  const gate = useConfirmGate();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(
      () => runPurgeCharacter(characterId, apiFetch),
      `Could not purge ${characterName}`,
    );
    if (outcome.kind === 'emptied') {
      gate.reset();
      onEmptied();
    } else if (outcome.kind === 'stayed') {

      gate.reset();
      toast.success(`${characterName}’s data was purged`);
      router.refresh();
    }

  }

  return (
    <Card className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="min-w-0 truncate font-data text-ui text-text">{characterName}</span>

      <DangerButton triggerRef={triggerRef} onClick={gate.request} label="Purge" />
      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Purge character"
        consequence={isOnlyCharacter ? (
            <>
              Purge {characterName}? This is your only character, so this also deletes your account —
              all of your saved data will be lost.
            </>

          ) : (
            <>
              Purge {characterName}? This clears the data the site has stored for this character and
              stops LGI.tools from accessing its EVE data.
            </>

          )}
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Purge character"
        busyLabel="Purging…"
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        className="w-[min(380px,calc(100vw-2rem))]"
      />
    </Card>

  );
}

function LogoutEverywhereControl() {
  const gate = useConfirmGate();
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  async function onConfirm() {
    const outcome = await gate.run(
      () => runLogoutEverywhere(apiFetch),
      'Could not sign out everywhere',
    );
    if (outcome.kind === 'done') {

      const target = redirectTargetFor(outcome) ?? '/';
      void authClient.signOut().finally(() => {
        window.location.href = target;
      });
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ui text-text">Log out everywhere</p>

        <p className="text-ui text-muted">Ends every active session, including this device.</p>

      </div>

      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={gate.request}
        className="shrink-0"
      >
        Log out everywhere
      </Button>

      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Log out everywhere"
        consequence="Sign out on every device, including this one? You’ll need to sign in again here afterward."
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Sign out everywhere"
        busyLabel="Signing out…"
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        tone="neutral"
        className="w-[min(380px,calc(100vw-2rem))]"
      />
    </div>

  );
}

function DeleteAccountControl({ onEmptied }: { onEmptied: () => void }) {
  const gate = useConfirmGate();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const canConfirm = isDeleteAcknowledged(acknowledged) && !gate.busy;

  function openDialog() {
    setAcknowledged(false);
    gate.request();
  }

  async function onConfirm() {
    if (!isDeleteAcknowledged(acknowledged)) return;
    const outcome = await gate.run(() => runDeleteAccount(apiFetch), 'Could not delete your account');
    if (outcome.kind === 'emptied') {
      gate.reset();
      onEmptied();
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-ui text-text">Delete account</p>

        <p className="text-ui text-muted">
          Permanently removes your account and every character’s data.
        </p>

      </div>

      <DangerButton triggerRef={triggerRef} onClick={openDialog} label="Delete" className="px-2.5" />
      <ConfirmDialog
        open={gate.open}
        onOpenChange={(next) => {
          if (!next) gate.cancel();
        }}
        title="Delete account"
        consequence="Are you sure you want to do this? All of your saved data will be lost."
        busy={gate.busy}
        error={gate.errored ? 'Something went wrong. Please try again.' : undefined}
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        confirmDisabled={!canConfirm}
        onConfirm={() => void onConfirm()}
        finalFocus={triggerRef}
        className="w-[min(400px,calc(100vw-2rem))]"
      >
        <label className="flex items-start gap-2 text-ui text-text">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
            label="Acknowledge permanent account deletion"
            tone="red"
            disabled={gate.busy}
            className="mt-0.5"
          />
          <span>I understand my account and all of my saved data will be lost.</span>

        </label>

      </ConfirmDialog>

    </div>

  );
}
